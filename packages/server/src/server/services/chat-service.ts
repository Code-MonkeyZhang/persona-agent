/**
 * @fileoverview 聊天服务 - 处理消息的核心逻辑。
 */

import { SessionManager } from '../../session/index.js';
import {
  getAgentConfig,
  AgentCore,
  createAgentRunConfig,
  formatAppNotificationForAgent,
  formatPendingInputForAgent,
  resolveWorkspaceDir,
  persistResolvedWorkspace,
} from '../../agent/index.js';
import { runCompression } from './compress-service.js';
import { buildRuntimeContext } from './runtime-context.js';
import {
  estimateMessagesTokens,
  estimateMessageTokens,
} from '../../agent/memory/token-estimate.js';
import type { Message, ToolCall } from '../../schema/index.js';
import type { PendingInput } from '@persona/shared';
import type { ToolResult } from '../../tools/index.js';
import { Logger } from '../../util/logger.js';
import { broadcastToSession } from '../websocket-server.js';
import * as sessionRegistry from './session-registry.js';
import {
  addPendingInput,
  drainPendingInputs,
  hasPendingInputs,
} from './pending-input-service.js';
import { generateTitle } from '../../session/title-generator.js';
import { loadTtsConfig } from '../../tts/store.js';
import { getAllVoices } from '../../tts/voices.js';
import { getLanguageBoost } from '../../tts/types.js';
import { processTextForTTS } from '../../tts/text-processor.js';

const MAX_RESULT_LENGTH = 1000;
/** 溢出安全网：未摘要消息估算 token 超过上下文窗口的该比例时触发头部裁切 */
const SAFETY_NET_RATIO = 0.9;

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return `${str.slice(0, maxLen)}...`;
}

/**
 * 处理聊天消息的请求参数。
 */
interface ChatRequest {
  agentId: string;
  sessionId: string;
  content: string;
  voiceEnabled?: boolean;
  sessionManager: SessionManager;
  /** 设置时表示本次对话由 App 通知触发，跳过标题生成 */
  appSource?: string;
}

/**
 * 处理聊天消息的响应。
 */
interface ChatResponse {
  success: boolean;
  error?: string;
  /** 会话忙时消息已进待注入缓冲，条目 id 供前端对账 */
  pendingId?: string;
}

/**
 * 将一条历史消息加载进 Agent 的消息列表。
 *
 * app_notification / context 消息在运行时转成 user 消息发给 LLM，不写回存储。
 */
function loadMessageIntoAgent(agent: AgentCore, msg: Message): void {
  if (msg.role === 'system') return;
  if (msg.role === 'app_notification') {
    agent.messages.push({
      role: 'user',
      content: formatAppNotificationForAgent(msg.source, msg.content),
    });
  } else if (msg.role === 'context') {
    agent.messages.push({
      role: 'user',
      content: msg.content,
    });
  } else {
    agent.messages.push(msg);
  }
}

/**
 * 待注入消息的落盘形态：一律存原文，前缀只在进入 Agent 上下文时拼接。
 * - user 插话存原话，与落盘、上下文、界面显示保持同一份文本
 * - app 通知存既有 app_notification 角色，与空闲直发路径一致
 */
function toPersistedMessage(input: PendingInput): Message {
  if (input.source === 'app') {
    return {
      role: 'app_notification',
      source: input.sourceName ?? input.source,
      content: input.content,
    };
  }
  return { role: 'user', content: input.content };
}

/**
 * 增量保存消息到Session中
 *
 * 从 agent 的消息列表中提取新增消息，
 * 并逐条追加到Session管理器中进行持久化存储。
 *
 * @param sessionManager - Session管理器，负责消息持久化
 * @param sessionId - Session唯一标识符
 * @param agent - agent核心对象，包含完整的消息历史
 * @param historyLength - 历史消息长度，用于界定新增消息的起始位置
 */
function saveStepMessages(
  sessionManager: SessionManager,
  sessionId: string,
  agent: AgentCore,
  historyLength: number
): void {
  const newMessages = agent.messages.slice(historyLength);
  for (const msg of newMessages) {
    sessionManager.appendMessage(sessionId, msg);
  }
}

/**
 * 处理聊天请求，执行 Agent 对话流程
 *
 * @param request - 聊天请求参数
 * @param request.agentId - Agent 标识符
 * @param request.sessionId - Session标识符
 * @param request.content - 用户消息内容
 * @param request.sessionManager - Session管理器
 *
 * @returns 聊天响应，包含成功状态和可能的错误信息
 * 实时内容通过 WebSocket step_complete 事件推送
 */
export async function processChat(request: ChatRequest): Promise<ChatResponse> {
  const {
    agentId,
    sessionId,
    content,
    voiceEnabled,
    sessionManager,
    appSource,
  } = request;

  /**
   * 持久化错误消息并广播 error + round_complete 事件
   * - 落盘 { role: 'error', content } 到 session JSONL
   * - 广播 WS error + round_complete，通知前端
   */
  const emitError = (errorContent: string): ChatResponse => {
    sessionManager.appendMessage(sessionId, {
      role: 'error',
      content: errorContent,
    });
    Logger.log('CHAT', 'Error persisted', { sessionId, error: errorContent });
    broadcastToSession(sessionId, {
      type: 'error',
      sessionId,
      message: errorContent,
    });
    broadcastToSession(sessionId, { type: 'round_complete', sessionId });
    return { success: false, error: errorContent };
  };

  const session = sessionManager.getSession(sessionId);
  // TODO: 这个已经在外面查过了, 是不是不用再查一遍了? 或者这个本来就应该放在这里check?
  if (!session) {
    return emitError(`Session not found: ${sessionId}`);
  }

  const agentConfig = getAgentConfig(agentId);
  if (!agentConfig) {
    return emitError(`Agent not found: ${agentId}`);
  }

  // 运行时解析工作目录：显式配置失效时写回生效路径并广播，
  // 下次解析直接通过，避免每个回合重复回退
  const resolved = resolveWorkspaceDir(session, agentConfig);
  const workspaceDir = resolved.dir;
  if (resolved.invalid.length > 0) {
    persistResolvedWorkspace(resolved, agentId, sessionId, sessionManager);
    Logger.log('WORKSPACE', 'Invalid workspace persisted with fallback', {
      sessionId,
      agentId,
      invalid: resolved.invalid,
      fallbackPath: workspaceDir,
    });
    broadcastToSession(sessionId, {
      type: 'workspace_fallback',
      sessionId,
      agentId,
      fallbackPath: workspaceDir,
    });
  }

  // 重入保护：生成中的会话不做并发回合，消息进入待注入缓冲
  if (sessionRegistry.has(sessionId)) {
    const input: Omit<PendingInput, 'id'> = appSource
      ? { source: 'app', sourceName: appSource, content }
      : { source: 'user', content };
    const pending = addPendingInput(sessionId, input);
    return { success: true, pendingId: pending.id };
  }

  const abortController = new AbortController();
  sessionRegistry.register(sessionId, abortController);
  Logger.log('CHAT', 'Abort controller registered', { sessionId });

  try {
    const runConfig = createAgentRunConfig(
      agentConfig,
      session,
      workspaceDir,
      sessionManager
    );
    // 忙时插话接线：runStream 每个步骤间隙取空待注入缓冲
    runConfig.takePendingInputs = () => drainPendingInputs(sessionId);
    const isChatSession = session.id.startsWith('chat');

    const agent = new AgentCore(runConfig);

    // 把除了 SystemPrompt 以外的消息推入 Agent, 新的SystemPrompt已经在构建AgentCore时注入了。
    if (isChatSession) {
      // 聊天 Session：压缩模式。只加载 summarizedUpTo 之后的近期原始消息；
      // 若该切片估算 token 超过上下文窗口的 90%，从头部裁掉最老的完整轮次。
      const summarizedUpTo = session.summarizedUpTo ?? 0;
      let messagesToLoad = session.messages.slice(summarizedUpTo);
      const safetyNetTokens = Math.floor(
        SAFETY_NET_RATIO * runConfig.model.contextWindow
      );
      if (estimateMessagesTokens(messagesToLoad) > safetyNetTokens) {
        messagesToLoad = trimToSafetyWindow(messagesToLoad, safetyNetTokens);
        Logger.log('CHAT', 'Safety net trimmed messages', {
          sessionId,
          remaining: messagesToLoad.length,
        });
      }
      for (const msg of messagesToLoad) {
        loadMessageIntoAgent(agent, msg);
      }
    } else {
      // 普通 Session全量加载原始消息。
      // TODO: 普通Session应该使用滑动窗口等简单机制, 而不是全部加载
      for (const msg of session.messages) {
        loadMessageIntoAgent(agent, msg);
      }
    }

    // 遗留缓冲消费：上一回合停止后驻留的插话先于本回合新消息进入历史
    for (const input of drainPendingInputs(sessionId)) {
      agent.addUserMessage(formatPendingInputForAgent(input));
      sessionManager.appendMessage(sessionId, toPersistedMessage(input));
    }

    let historyLength = agent.messages.length;
    if (appSource) {
      // App 通知：Agent 收到带前缀的 user 消息，session 存储 app_notification 原文
      agent.addUserMessage(formatAppNotificationForAgent(appSource, content));
      sessionManager.appendMessage(sessionId, {
        role: 'app_notification',
        source: appSource,
        content,
      });
      // 广播回合开始信号，客户端据此创建 AI 占位气泡，之后 step_complete 正常填入
      broadcastToSession(sessionId, {
        type: 'app_notification',
        sessionId,
        source: appSource,
        content,
      });
      Logger.log('CHAT', 'App notification broadcast', {
        sessionId,
        source: appSource,
      });
    } else {
      agent.addUserMessage(content);
      saveStepMessages(sessionManager, sessionId, agent, historyLength);
    }
    historyLength = agent.messages.length;
    Logger.log('CHAT', 'Message added', {
      agentId,
      sessionId,
      source: appSource ?? 'user',
    });

    // 运行时上下文注入：纯文本 user 消息进模型上下文，context 角色副本落盘。
    // 双写防重复——落盘后立即推进 historyLength 越过内存中的 user 副本，
    // 避免 saveStepMessages 按 historyLength 切片时把它再存一遍。
    const runtimeContext = buildRuntimeContext(
      sessionId,
      session,
      workspaceDir,
      agentConfig.mcpNames
    );
    if (runtimeContext) {
      agent.addUserMessage(runtimeContext);
      sessionManager.appendMessage(sessionId, {
        role: 'context',
        source: 'runtime-context',
        content: runtimeContext,
      });
      historyLength = agent.messages.length;
    }

    // Fire-and-forget: auto-generate title base on the first user message
    const isFirstMessage = session.messages.length === 0;
    const isDefaultTitle = session.title === 'New Session';
    if (!appSource && isFirstMessage && isDefaultTitle && !isChatSession) {
      Logger.log('TITLE', 'Auto-generating title', { sessionId });
      const { provider: modelProvider, model: modelId } = session.model;
      generateTitle(content, modelProvider, modelId)
        .then((title) => {
          if (!title) {
            return;
          }
          Logger.log('TITLE', 'Title generated', { sessionId, title });
          sessionManager.updateTitle(sessionId, title);
          broadcastToSession(sessionId, {
            type: 'title_updated',
            sessionId,
            title,
          });
        })
        .catch((err) => {
          Logger.log('TITLE', 'Generation error', {
            sessionId,
            error: (err as Error).message,
          });
        });
    }

    // 创建一个临时容器, 收集当前step的所有内容 方便广播
    let lastContentText: string | null = null;
    let currentStep: {
      stepIndex: number;
      thinking: string;
      content: string;
      toolCalls: ToolCall[];
      toolResults: {
        toolCallId: string;
        toolName: string;
        result: string;
        success: boolean;
      }[];
    } | null = null;

    /** Build a step_complete event payload from the current step accumulator. */
    const buildStepCompleteEvent = () => ({
      type: 'step_complete' as const,
      sessionId,
      stepIndex: currentStep!.stepIndex,
      thinking: currentStep!.thinking || undefined,
      // TODO: 临时去重 — 某些 OpenAI 兼容提供者会在 content 和 reasoning_content 中返回相同文本，
      // 导致 thinking 与 content 完全一致。应在 agent.ts 层面改用 streamSimple() 正确控制 reasoning 行为。
      content:
        currentStep!.thinking && currentStep!.thinking === currentStep!.content
          ? undefined
          : currentStep!.content || undefined,
      toolCalls:
        currentStep!.toolCalls.length > 0
          ? currentStep!.toolCalls.map((tc) => ({
              id: tc.id,
              name: tc.function.name,
              arguments: tc.function.arguments,
            }))
          : undefined,
      toolResults:
        currentStep!.toolResults.length > 0
          ? currentStep!.toolResults
          : undefined,
    });

    /**
     * Flush the current step: save messages, log, and broadcast step_complete.
     * Resets currentStep to null after broadcasting.
     *
     * After saving, updates historyLength to the current agent.messages.length
     * so the next flush only saves newly added messages (fixes #56).
     */
    const flushCurrentStep = () => {
      if (!currentStep) return;
      if (currentStep.content) {
        lastContentText = currentStep.content;
      }
      saveStepMessages(sessionManager, sessionId, agent, historyLength);
      historyLength = agent.messages.length;
      Logger.log('CHAT', 'Step complete', {
        sessionId,
        stepIndex: currentStep.stepIndex,
        thinking: currentStep.thinking,
        content: currentStep.content,
        toolCallCount: currentStep.toolCalls.length,
        toolResultCount: currentStep.toolResults.length,
      });
      for (const tr of currentStep.toolResults) {
        const toolCall = currentStep.toolCalls.find(
          (tc) => tc.id === tr.toolCallId
        );
        Logger.log('TOOL', `Tool executed: ${tr.toolName}`, {
          sessionId,
          toolName: tr.toolName,
          arguments: toolCall?.function.arguments,
          success: tr.success,
          result: truncate(tr.result, MAX_RESULT_LENGTH),
        });

        // show_pose 校验通过时，将 pose 持久化到 session 元数据
        if (tr.toolName === 'show_pose' && tr.success && toolCall) {
          const pose = toolCall.function.arguments['pose'] as
            | string
            | undefined;
          if (pose) {
            sessionManager.updatePose(sessionId, pose);
            Logger.log('POSE', 'Pose persisted to session', {
              sessionId,
              pose,
            });
          }
        }
      }
      broadcastToSession(sessionId, buildStepCompleteEvent());
      currentStep = null;
    };

    /**
     * Abort 收尾：存盘 AgentCore 已整理的半成品（含 stopReason: 'aborted'），
     * 广播 aborted 事件，跳过 TTS 和压缩。
     */
    const emitAborted = (): ChatResponse => {
      saveStepMessages(sessionManager, sessionId, agent, historyLength);
      Logger.log('CHAT', 'Turn aborted by user', {
        sessionId,
        stepIndex: currentStep?.stepIndex,
        partialContentLength: currentStep?.content.length ?? 0,
      });
      broadcastToSession(sessionId, {
        type: 'aborted',
        sessionId,
        reason: 'user_cancel',
      });
      return { success: false, error: 'aborted' };
    };

    // 开启agent loop循环。内层跑完一轮 runStream 后检查缓冲，
    // 回合自然结束时缓冲非空则续跑下一轮消费插话，直到缓冲清空才发完成信号
    for (;;) {
      for await (const event of agent.runStream(abortController.signal)) {
        switch (event.type) {
          case 'step_start':
            flushCurrentStep();
            currentStep = {
              stepIndex: event.step,
              thinking: '',
              content: '',
              toolCalls: [],
              toolResults: [],
            };
            break;

          case 'thinking':
            if (currentStep) {
              currentStep.thinking += event.content;
            }
            break;

          case 'content':
            if (currentStep) {
              currentStep.content += event.content;
            }
            break;

          case 'tool_call':
            if (currentStep) {
              currentStep.toolCalls.push(...event.tool_calls);
            }
            break;

          case 'tool_result': {
            if (currentStep) {
              const tr: ToolResult = event.result;
              currentStep.toolResults.push({
                toolCallId: event.toolCallId,
                toolName: event.toolName,
                result: tr.success
                  ? tr.content
                  : `Error: ${tr.error ?? 'Unknown error'}`,
                success: tr.success,
              });
            }
            break;
          }

          case 'inputs_injected': {
            // 注入时机在 step_start 之前，currentStep 仍持有上一步内容，先落盘广播
            flushCurrentStep();
            for (const input of event.inputs) {
              sessionManager.appendMessage(
                sessionId,
                toPersistedMessage(input)
              );
            }
            // 双写防御：事件先于消息 push 产出，按条数预推进切片起点，
            // 跳过即将 push 进来的上下文副本，避免 saveStepMessages 重复落盘
            historyLength += event.inputs.length;
            Logger.log('CHAT', 'Pending inputs injected', {
              sessionId,
              count: event.inputs.length,
            });
            break;
          }

          case 'error': {
            Logger.log('CHAT', 'Stream error, discarding partial step', {
              sessionId,
              stepIndex: currentStep?.stepIndex,
              partialContentLength: currentStep?.content.length ?? 0,
            });
            return emitError(event.error);
          }

          case 'aborted': {
            Logger.log('CHAT', 'Agent reported aborted, finalizing', {
              sessionId,
              stepIndex: currentStep?.stepIndex,
            });
            return emitAborted();
          }
        }
      }

      // 处理最后一个step
      flushCurrentStep();

      // 缓冲非空说明最后一步执行期间有新插话到达，续跑下一轮消费
      if (!hasPendingInputs(sessionId)) break;
      Logger.log('CHAT', 'Starting next round for pending inputs', {
        sessionId,
      });
      // 轮次边界信号，前端只关当前轮气泡，生成状态保持
      broadcastToSession(sessionId, { type: 'turn_complete', sessionId });
    }

    // 回合边界信号，回合工作结束
    broadcastToSession(sessionId, { type: 'round_complete', sessionId });

    // Fire-and-forget: TTS voice processing
    // App 通知触发的回合与手动发消息同权，是否播报由客户端开关决定
    if (voiceEnabled) {
      handleTtsAsync(sessionId, session, agentConfig, lastContentText).catch(
        () => {}
      );
    }

    // Fire-and-forget: 异步上下文压缩
    if (isChatSession) {
      runCompression({
        agentId,
        sessionId,
        sessionManager,
        threshold: agentConfig.compressionThreshold,
        contextWindow: runConfig.model.contextWindow,
        provider: runConfig.provider,
        modelId: runConfig.modelId,
      }).catch(() => {});
    }

    return { success: true };
  } catch (error) {
    const err = error as Error;
    return emitError(err.message);
  } finally {
    sessionRegistry.unregister(sessionId);
  }
}

/**
 * Async TTS pipeline after chat completes.
 *
 * Checks preconditions (apiKey, voiceId, content, voice existence),
 * processes text via cleanText + optional LLM, then broadcasts
 * speak_ready or speak_error via WebSocket.
 */
async function handleTtsAsync(
  sessionId: string,
  session: { model: { provider: string; model: string } },
  agentConfig: { voiceId?: string; voiceLanguage?: string },
  lastContentText: string | null
): Promise<void> {
  Logger.log('TTS', 'Starting async pipeline', {
    sessionId,
    voiceId: agentConfig.voiceId ?? '(none)',
    voiceLanguage: agentConfig.voiceLanguage ?? 'default',
    hasContent: !!lastContentText,
    contentLength: lastContentText?.length ?? 0,
  });

  const ttsConfig = loadTtsConfig();

  if (!ttsConfig.apiKey) {
    Logger.log('TTS', 'Precondition failed: no API key', { sessionId });
    broadcastToSession(sessionId, {
      type: 'speak_error',
      sessionId,
      reason: 'no_api_key',
      message: '未配置 MiniMax API Key',
    });
    return;
  }

  if (!agentConfig.voiceId) {
    Logger.log('TTS', 'Precondition failed: no voice ID', { sessionId });
    broadcastToSession(sessionId, {
      type: 'speak_error',
      sessionId,
      reason: 'no_voice_id',
      message: '未设置语音音色',
    });
    return;
  }

  if (!lastContentText) {
    Logger.log('TTS', 'Precondition failed: no content', { sessionId });
    broadcastToSession(sessionId, {
      type: 'speak_error',
      sessionId,
      reason: 'no_content',
      message: '无语音内容',
    });
    return;
  }

  const allVoices = getAllVoices();
  if (!allVoices.some((v) => v.id === agentConfig.voiceId)) {
    Logger.log('TTS', 'Precondition failed: voice not found', {
      sessionId,
      voiceId: agentConfig.voiceId,
    });
    broadcastToSession(sessionId, {
      type: 'speak_error',
      sessionId,
      reason: 'voice_not_found',
      message: '音色不存在或已被删除',
    });
    return;
  }

  const speakText = await processTextForTTS(lastContentText, {
    language: agentConfig.voiceLanguage,
    provider: session.model.provider,
    modelId: session.model.model,
  });

  Logger.log('TTS', 'speak_ready sent', {
    sessionId,
    speakText,
    speakTextLength: speakText.length,
    voiceId: agentConfig.voiceId,
    ttsModel: ttsConfig.model,
    languageBoost: getLanguageBoost(agentConfig.voiceLanguage) ?? 'none',
  });

  broadcastToSession(sessionId, {
    type: 'speak_ready',
    sessionId,
    speakText,
    voiceId: agentConfig.voiceId,
    apiKey: ttsConfig.apiKey,
    model: ttsConfig.model,
    languageBoost: getLanguageBoost(agentConfig.voiceLanguage),
  });
}

/**
 * 溢出安全网裁切：未摘要消息估算 token 超过上下文窗口的 90% 时，
 * 从头部裁掉最老的若干完整轮，只保留能装进预算的最近一段。
 *
 * 从尾部向前累计 token，直到加入下一条会超预算为止；再把起点对齐到
 * 一条 user 消息，避免留下孤立的 assistant 回复。被裁掉的消息仍在磁盘，
 * 下一轮压缩会兜底，不丢数据。
 *
 * @param messages - 未摘要的消息切片
 * @param maxTokens - 安全网预算 token 数
 * @returns 裁切后保留的消息数组
 */
function trimToSafetyWindow(messages: Message[], maxTokens: number): Message[] {
  let acc = 0;
  let start = messages.length;
  for (let i = messages.length - 1; i >= 0; i--) {
    const t = estimateMessageTokens(messages[i]!);
    if (acc + t > maxTokens) break;
    acc += t;
    start = i;
  }
  // 起点对齐到 user 消息
  while (start < messages.length && messages[start]!.role !== 'user') {
    start++;
  }
  return messages.slice(start);
}
