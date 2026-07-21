/**
 * @fileoverview 聊天服务 - 处理消息的核心逻辑。
 */

import { SessionManager } from '../../session/index.js';
import {
  getAgentConfig,
  AgentCore,
  createAgentRunConfig,
} from '../../agent/index.js';
import { runCompression } from './compress-service.js';
import {
  estimateMessagesTokens,
  estimateMessageTokens,
} from '../../agent/memory/token-estimate.js';
import type { Message, ToolCall } from '../../schema/index.js';
import type { ToolResult } from '../../tools/index.js';
import { Logger } from '../../util/logger.js';
import { broadcastToSession } from '../websocket-server.js';
import * as sessionRegistry from '../session-registry.js';
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
}

/**
 * 处理聊天消息的响应。
 */
interface ChatResponse {
  success: boolean;
  error?: string;
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
  const { agentId, sessionId, content, voiceEnabled, sessionManager } = request;

  /**
   * 持久化错误消息并广播 error + complete 事件
   * - 落盘 { role: 'error', content } 到 session JSONL
   * - 广播 WS error + complete，通知前端
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
    broadcastToSession(sessionId, { type: 'complete', sessionId });
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

  //TODO: 这里不应该使用当前目录作为兜底, 应该在 persona-agent data directory 中有一个空的 workspace 作为默认工作目录
  const workspaceDir =
    session.workspacePath || agentConfig.defaultWorkspacePath || process.cwd();

  // 重入保护：同一会话不能并发执行两次 processChat
  if (sessionRegistry.has(sessionId)) {
    Logger.log('CHAT', 'Session busy, rejected', { sessionId });
    return { success: false, error: 'Session is currently generating' };
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
    const isChatSession = session.id.startsWith('chat');

    const agent = new AgentCore(runConfig);

    // 把除了 SystemPrompt 以外的消息推入 Agent, 新的SystemPrompt已经在构建AgentCore时注入了。
    if (isChatSession) {
      // 聊天 Session：压缩模式。只加载 summarizedUpTo 之后的近期原始消息；
      // 若该切片估算 token 超过上下文窗口的 90%，从头部裁掉最老的完整轮。
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
        if (msg.role !== 'system') {
          agent.messages.push(msg);
        }
      }
    } else {
      // 普通 Session全量加载原始消息。
      // TODO: 普通Session应该使用滑动窗口等简单机制, 而不是全部加载
      for (const msg of session.messages) {
        if (msg.role !== 'system') {
          agent.messages.push(msg);
        }
      }
    }

    let historyLength = agent.messages.length;
    agent.addUserMessage(content);
    saveStepMessages(sessionManager, sessionId, agent, historyLength);
    historyLength = agent.messages.length;
    Logger.log('CHAT', 'User message added', { agentId, sessionId, content });

    // Fire-and-forget: auto-generate title base on the first user message
    const isFirstMessage = session.messages.length === 0;
    const isDefaultTitle = session.title === 'New Session';
    if (isFirstMessage && isDefaultTitle && !isChatSession) {
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

    // 开启agent loop循环
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

    // 发送完成信号
    broadcastToSession(sessionId, { type: 'complete', sessionId });

    // Fire-and-forget: TTS voice processing
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
