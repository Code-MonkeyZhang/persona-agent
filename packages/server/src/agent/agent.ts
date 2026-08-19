/**
 * @fileoverview 核心Agent运行时，执行LLM对话并支持工具调用。
 *
 */

import type { Message, AgentEvent, ToolCall } from '../schema/index.js';
import type { AgentRunConfig } from './types.js';
import type { Tool, ToolResult } from '../tools/index.js';
import { convertContext, convertPiAiToolCall } from '../converters/index.js';
import { models } from './pi-models.js';
import { Logger } from '../util/logger.js';

export class AgentCore {
  public runConfig: AgentRunConfig;
  public messages: Message[] = [];
  public tools: Map<string, Tool> = new Map();

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
   * @param content - 用户消息文本
   * TODO: 如果要支持多模态这个要改
   */
  addUserMessage(content: string): void {
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
   * 持续运行直到模型不再产生工具调用或达到最大步数。
   *
   * @yields AgentEvent - 表示执行不同阶段的事件
   * @returns 任务完成或超过最大步数时的最终内容字符串
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

      yield {
        type: 'step_start',
        step: step + 1,
        maxSteps: this.runConfig.maxSteps,
      };

      let fullContent = '';
      let fullThinking = '';
      const toolCalls: ToolCall[] = [];
      const toolList = Array.from(this.tools.values());

      // convert tools & messages to pi-ai format
      const context = convertContext(
        this.runConfig.systemPrompt,
        this.messages,
        toolList
      );

      // Accumulate content chunk
      const eventStream = models.stream(this.runConfig.model, context, {
        apiKey: this.runConfig.apiKey,
        thinkingEnabled: true,
        signal,
        maxRetries: 2,
      });

      for await (const event of eventStream) {
        if (event.type === 'thinking_delta') {
          yield { type: 'thinking', content: event.delta };
          fullThinking += event.delta;
        }
        if (event.type === 'text_delta') {
          yield { type: 'content', content: event.delta };
          fullContent += event.delta;
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

      // signal 中断后的半成品整理：有实际内容时给未完成的 tool 补 fake result，
      // push 带 stopReason 的消息；全空则跳过，避免存出空消息
      if (signal?.aborted) {
        if (fullContent || fullThinking || toolCalls.length > 0) {
          for (const tc of toolCalls) {
            if (!tc.toolResult) {
              tc.toolResult = {
                content: '用户中断了此工具的执行',
                isError: true,
              };
            }
          }
          this.messages.push({
            role: 'assistant',
            content: fullContent,
            thinking: fullThinking || undefined,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
            stopReason: 'aborted',
          });
        }
        yield { type: 'aborted' };
        return fullContent;
      }

      // 如果没有Tool Call就结束循环
      if (toolCalls.length === 0) {
        this.messages.push({
          role: 'assistant',
          content: fullContent,
          thinking: fullThinking || undefined,
        });
        return fullContent;
      }

      yield { type: 'tool_call', tool_calls: toolCalls };

      //执行每一个Tool Call
      for (const toolCall of toolCalls) {
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
        content: fullContent,
        thinking: fullThinking || undefined,
        tool_calls: toolCalls,
      });
    }

    return `Task couldn't be completed after ${this.runConfig.maxSteps} steps.`;
  }
}
