/**
 * @fileoverview 核心Agent运行时，执行LLM对话并支持工具调用。
 *
 */

import type { Message, AgentEvent, ToolCall } from '../schema/index.js';
import type { ContentBlock } from '@persona/shared';
import type { AgentRunConfig } from './types.js';
import type { Tool, ToolResult } from '../tools/index.js';
import {
  convertContext,
  convertPiAiToolCall,
  stripNarrationFields,
} from './pi-ai-converter.js';
import { formatPendingInputForAgent } from './inject.js';
import { models } from './pi-models.js';
import { Logger } from '../util/logger.js';

/** 强制收尾轮注入的临时指令，只随请求发出不进消息历史 */
const FORCED_FINAL_TURN_INSTRUCTION = [
  '本轮工具调用次数已达上限，所有工具现已禁用。',
  '请立即停止调用任何工具，直接用文字回应用户。',
].join('\n');

/** 强制收尾轮漏网调用的统一拒绝结果 */
const FORCED_FINAL_TURN_REJECTION =
  '工具已达调用上限，本轮已被禁用，请直接用文字回应用户。';

/** 强制收尾轮极端无产出时的固定兜底文案 */
const FORCED_FINAL_TURN_FALLBACK = '这轮我有点卡住了，你可以再说一句吗？';

/** 单次模型流式调用消费完毕后的累计产出 */
type StepStreamOutcome = {
  content: string;
  thinking: string;
  toolCalls: ToolCall[];
  /** signal 在流期间被触发，调用方需走中断收尾路径 */
  aborted: boolean;
};

/** 追加给 models.stream 的每步覆盖选项，强制收尾轮携带 toolChoice none */
type StepStreamOverrides = { toolChoice?: 'none' };

export class AgentCore {
  public runConfig: AgentRunConfig;
  public messages: Message[] = [];
  public tools: Map<string, Tool> = new Map();
  /**
   * 临时尾部消息，随每次模型请求拼接在 messages 之后。
   * 相关记忆节用完即弃：不进消息数组不落盘，ReAct 多步每步都在尾部，
   * 请求结束无需清理，abort 路径零负担。
   */
  public ephemeralTail?: string;

  constructor(config: AgentRunConfig) {
    this.runConfig = config;
    this.messages = [{ role: 'system', content: config.systemPrompt }];

    // add tools to map
    for (const tool of config.tools) {
      this.tools.set(tool.name, tool);
    }
  }

  /**
   * 向对话历史添加用户消息。
   *
   * @param content - 纯文本为字符串，带附件为内容块数组
   */
  addUserMessage(content: string | ContentBlock[]): void {
    this.messages.push({
      role: 'user',
      content,
    });
  }

  /**
   * 根据名称和参数执行工具。
   *
   * 对 Agent App 工具，无条件注入 agentId/sessionId 到参数中，
   * 覆盖模型可能填入的值——平台不信任模型对这两个字段的填写。
   *
   * @param name - 要执行的工具名称
   * @param params - 传递给工具execute方法的参数
   * @returns ToolResult，包含成功状态、内容和可选的错误信息
   */
  async executeTool(
    name: string,
    params: Record<string, unknown>
  ): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return {
        success: false,
        content: '',
        error: `Unknown tool: ${name}`,
      };
    }

    // Agent App 工具注入：无条件覆盖 agentId/sessionId
    const { agentId, sessionId, agentAppToolNames } = this.runConfig;
    if (agentAppToolNames?.has(name) && agentId && sessionId) {
      params = { ...params, agentId, sessionId };
      Logger.log(
        'MCP',
        `Injected agentId/sessionId into Agent App tool '${name}'`
      );
    }

    try {
      return await tool.execute(params);
    } catch (error) {
      const err = error as Error;
      return {
        success: false,
        content: '',
        error: `Tool execution failed: ${err.message}`,
      };
    }
  }

  /**
   * 主ReAct循环。
   *
   * 产出思考、内容和工具执行的事件。
   * 持续运行直到模型不再产生工具调用；跑满 maxSteps 仍未自然退出时
   * 追加强制无工具收尾轮，保证回合必以文字收尾。
   *
   * @yields AgentEvent - 表示执行不同阶段的事件
   * @returns 任务完成或收尾轮产出的最终内容字符串
   */
  async *runStream(
    signal?: AbortSignal
  ): AsyncGenerator<AgentEvent, string, void> {
    for (let step = 0; step < this.runConfig.maxSteps; step++) {
      // 防御：工具执行期间若被中断，上一步消息已完整 push，直接退出
      if (signal?.aborted) {
        yield { type: 'aborted' };
        return '';
      }

      // 忙时插话：步骤间隙取待注入缓冲。事件先于消息 push 产出，
      // 消费方据此落盘原文并预推进切片起点，push 进来的副本由切片跳过
      const pendingInputs = this.runConfig.takePendingInputs?.() ?? [];
      if (pendingInputs.length > 0) {
        yield { type: 'inputs_injected', inputs: pendingInputs };
        for (const input of pendingInputs) {
          this.addUserMessage(formatPendingInputForAgent(input));
        }
      }

      yield {
        type: 'step_start',
        step: step + 1,
        maxSteps: this.runConfig.maxSteps,
      };

      const outcome = yield* this.consumeModelStream(signal);

      // signal 中断后的半成品整理：有实际内容时给未完成的 tool 补 fake result，
      // push 带 stopReason 的消息；全空则跳过，避免存出空消息
      if (outcome.aborted) {
        this.finalizeAbortedStep(outcome);
        yield { type: 'aborted' };
        return outcome.content;
      }

      // 如果没有Tool Call就结束循环
      if (outcome.toolCalls.length === 0) {
        this.messages.push({
          role: 'assistant',
          content: outcome.content,
          thinking: outcome.thinking || undefined,
        });
        return outcome.content;
      }

      yield { type: 'tool_call', tool_calls: outcome.toolCalls };

      //执行每一个Tool Call
      for (const toolCall of outcome.toolCalls) {
        // 源头剥离注入的叙述栏位，工具实现与后续上下文都看不到这两键
        stripNarrationFields(toolCall);
        const toolCallId = toolCall.id;
        const functionName = toolCall.function.name;
        const args = toolCall.function.arguments || {};

        yield { type: 'tool_start', toolCall };

        const result = await this.executeTool(functionName, args);

        yield {
          type: 'tool_result',
          result,
          toolCallId,
          toolName: functionName,
        };

        // 记录Tool Result
        toolCall.toolResult = {
          content: result.success
            ? result.content
            : `Error: ${result.error ?? 'Unknown error'}`,
          isError: !result.success,
        };
      }

      this.messages.push({
        role: 'assistant',
        content: outcome.content,
        thinking: outcome.thinking || undefined,
        tool_calls: outcome.toolCalls,
      });
    }

    // 主循环耗尽仍未自然退出，收尾轮保证用户必收到文字
    return yield* this.runForcedFinalTurn(signal);
  }

  /**
   * 执行一次模型流式调用并转产内部事件。
   *
   * 主循环每步与强制收尾轮共用：拼装临时尾部消息与上下文，
   * 消费 pi-ai 事件流，累计正文、思考与工具调用，期间转产
   * thinking、content 与 error 事件。中断只标记不处置，
   * 后续路径由调用方按 outcome 决定。
   *
   * @param signal - 调用方传入的中断信号
   * @param overrides - 追加的流选项，收尾轮携带 toolChoice none
   * @yields AgentEvent - thinking、content 与 error 事件
   * @returns 累计产出与 signal 中断标记
   */
  private async *consumeModelStream(
    signal: AbortSignal | undefined,
    overrides: StepStreamOverrides = {}
  ): AsyncGenerator<AgentEvent, StepStreamOutcome, void> {
    let content = '';
    let thinking = '';
    const toolCalls: ToolCall[] = [];

    // 临时尾部消息每步都拼在末尾，模型开口前离它最近
    const tail: Message | undefined = this.ephemeralTail
      ? { role: 'user', content: this.ephemeralTail }
      : undefined;
    const outbound = tail ? [...this.messages, tail] : this.messages;
    const context = convertContext(
      this.runConfig.systemPrompt,
      outbound,
      Array.from(this.tools.values())
    );

    // Accumulate content chunk
    const eventStream = models.stream(this.runConfig.model, context, {
      apiKey: this.runConfig.apiKey,
      thinkingEnabled: true,
      signal,
      maxRetries: 2,
      ...overrides,
    });

    for await (const event of eventStream) {
      if (event.type === 'thinking_delta') {
        yield { type: 'thinking', content: event.delta };
        thinking += event.delta;
      }
      if (event.type === 'text_delta') {
        yield { type: 'content', content: event.delta };
        content += event.delta;
      }
      if (event.type === 'toolcall_end') {
        const convertedToolCall = convertPiAiToolCall(event.toolCall);
        toolCalls.push(convertedToolCall);
      }
      if (event.type === 'error') {
        const errorEvent = event as {
          reason?: string;
          error?: { errorMessage?: string; stopReason?: string };
        };
        // signal 已触发时，任何错误都是连接撕裂的副作用，归类为 abort
        if (
          signal?.aborted ||
          errorEvent.reason === 'aborted' ||
          errorEvent.error?.stopReason === 'aborted'
        ) {
          break;
        }
        const errorMsg =
          errorEvent.error?.errorMessage ||
          errorEvent.error?.stopReason ||
          'LLM stream error';
        yield { type: 'error', error: errorMsg };
        break;
      }
      if (event.type === 'done') {
        break;
      }
    }

    return {
      content,
      thinking,
      toolCalls,
      aborted: signal?.aborted === true,
    };
  }

  /**
   * 中断后的半成品消息整理。
   *
   * 有实际内容时给未完成的 tool 补 fake result 并 push 带 stopReason
   * 的消息；全空则跳过，避免存出空消息。
   *
   * @param outcome - 被中断那步的累计产出
   */
  private finalizeAbortedStep(outcome: StepStreamOutcome): void {
    if (
      !outcome.content &&
      !outcome.thinking &&
      outcome.toolCalls.length === 0
    ) {
      return;
    }
    for (const toolCall of outcome.toolCalls) {
      if (!toolCall.toolResult) {
        toolCall.toolResult = {
          content: '用户中断了此工具的执行',
          isError: true,
        };
      }
    }
    this.messages.push({
      role: 'assistant',
      content: outcome.content,
      thinking: outcome.thinking || undefined,
      tool_calls: outcome.toolCalls.length > 0 ? outcome.toolCalls : undefined,
      stopReason: 'aborted',
    });
  }

  /**
   * 强制无工具收尾轮。
   *
   * 主循环跑满 maxSteps 仍未自然退出时触发，参照 opencode 的撞限收尾：
   * 临时改写 ephemeralTail 注入禁用工具的指令，请求携带 toolChoice none
   * 且工具定义保留以保住供应商缓存前缀，漏网的工具调用一律拒绝执行。
   * 收尾轮照常产出步骤事件，消费侧无需感知。结束前恢复原 ephemeralTail，
   * chat-service 的插话续跑会复用本实例再进 runStream。
   *
   * @param signal - 调用方传入的中断信号
   * @yields AgentEvent - 收尾轮的步骤与内容事件
   * @returns 收尾轮正文，极端无产出时返回固定中文兜底
   */
  private async *runForcedFinalTurn(
    signal: AbortSignal | undefined
  ): AsyncGenerator<AgentEvent, string, void> {
    Logger.log('AGENT', 'Max steps exhausted, starting forced no-tool turn', {
      maxSteps: this.runConfig.maxSteps,
    });
    const previousTail = this.ephemeralTail;
    this.ephemeralTail = FORCED_FINAL_TURN_INSTRUCTION;
    try {
      yield {
        type: 'step_start',
        step: this.runConfig.maxSteps + 1,
        maxSteps: this.runConfig.maxSteps,
      };

      const outcome = yield* this.consumeModelStream(signal, {
        toolChoice: 'none',
      });

      if (outcome.aborted) {
        this.finalizeAbortedStep(outcome);
        yield { type: 'aborted' };
        return outcome.content;
      }

      // 漏网调用不执行，挂禁用结果保证历史里每个 tool_call 都有配对结果
      for (const toolCall of outcome.toolCalls) {
        toolCall.toolResult = {
          content: FORCED_FINAL_TURN_REJECTION,
          isError: true,
        };
      }

      this.messages.push({
        role: 'assistant',
        content: outcome.content,
        thinking: outcome.thinking || undefined,
        tool_calls:
          outcome.toolCalls.length > 0 ? outcome.toolCalls : undefined,
      });

      Logger.log('AGENT', 'Forced no-tool turn finished', {
        contentLength: outcome.content.length,
        rejectedCalls: outcome.toolCalls.length,
        usedFallback: outcome.content.length === 0,
      });

      return outcome.content || FORCED_FINAL_TURN_FALLBACK;
    } finally {
      this.ephemeralTail = previousTail;
    }
  }
}
