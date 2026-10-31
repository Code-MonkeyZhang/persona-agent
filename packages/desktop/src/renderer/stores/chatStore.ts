/**
 * @file renderer/stores/chatStore.ts
 * @description 聊天状态管理 - 负责消息发送、WebSocket 消息接收分发与聊天状态维护
 *
 * 采用 per-session state map 隔离不同 session 的消息和加载状态，
 * 切换 session 时只更新 currentSessionId 指针，不再替换整个消息数组。
 */

import { create } from 'zustand';
import type { UIMessage, ConnectionStatus, Thought } from '../types/chat';
import type { SyncState } from '../lib/sync-engine';
import type { ServerMessage, StepCompleteMessage } from '@persona/shared';
import { buildPreviewText, summarizeToolInput } from '@persona/shared';
import type { LiveRunState, LiveStep } from '../components/chat/LiveStrip';
import { createMessage, sendChatMessage, WebSocketClient } from '../lib/api';
import { toast } from './toastStore';
import { logger } from '../lib/logger';
import { getErrorMessage } from '../lib/utils';
import i18n from '../i18n';
import { useAgentStore } from './agentStore';
import { useSessionStore, stripLastTextThought } from './sessionStore';
import { useCompanionStore } from './companionStore';
import { useVoiceStore } from './voiceStore';

/**
 * 将 step_complete 消息中的思考过程和工具调用转换为 Thought 数组。
 * 每步的 content 作为 text thought 保留在时间线，最终回答会在 complete 时移除。
 * @param msg - 服务端推送的步骤完成消息
 * @returns 转换后的 Thought 数组
 */
function cycleToThoughts(msg: StepCompleteMessage): Thought[] {
  const thoughts: Thought[] = [];

  // Add thinking
  if (msg.thinking) {
    thoughts.push({
      id: crypto.randomUUID(),
      type: 'thinking',
      timestamp: new Date(),
      content: msg.thinking,
    });
  }

  // Add intermediate text content
  if (msg.content) {
    thoughts.push({
      id: crypto.randomUUID(),
      type: 'text',
      timestamp: new Date(),
      content: msg.content,
    });
  }

  // Add tool_use with results
  msg.toolCalls?.forEach((tc) => {
    const result = msg.toolResults?.find((r) => r.toolCallId === tc.id);
    thoughts.push({
      id: tc.id,
      type: 'tool_use',
      timestamp: new Date(),
      toolName: tc.name,
      toolInput: tc.arguments,
      toolResult: result
        ? {
            output: result.result,
            isError: !result.success,
          }
        : undefined,
    });
  });

  return thoughts;
}

/**
 * 把 step_complete 的思考步骤合并进实时时间线。
 * 本步的思考段与解说文本插到未闭合工具步之前还原先思考后执行的叙述顺序，
 * 未闭合工具步与本次 tool_use 按出现顺序一一配对，agent 串行执行保证顺序一致，
 * 闭合时补全输入输出与失败态，tool_started 漏收的 tool_use 补一条已完成步，
 * 配对不上的未闭合步按孤儿收尾避免呼吸行悬挂，text 步骤由气泡正文承担不进行。
 * @param liveRun - 当前实时状态，null 时惰性创建
 * @param thoughts - cycleToThoughts 的产物
 * @returns 合并后的实时状态
 */
function mergeStepIntoLiveRun(
  liveRun: LiveRunState | null,
  thoughts: Thought[]
): LiveRunState {
  const now = Date.now();
  const steps = (liveRun?.steps ?? []).map((s) => ({ ...s }));
  const isOpenTool = (s: LiveStep) => s.tool !== '' && s.endedAt === undefined;

  const thinkSteps: LiveStep[] = [];
  for (const th of thoughts) {
    if ((th.type === 'thinking' || th.type === 'text') && th.content) {
      thinkSteps.push({
        tool: '',
        detail: th.content,
        startedAt: now,
        endedAt: now,
      });
    }
  }

  const toolThoughts = thoughts.filter((th) => th.type === 'tool_use');
  const openSteps = steps.filter(isOpenTool);
  const closed: LiveStep[] = [];
  const missed: LiveStep[] = [];
  toolThoughts.forEach((th, i) => {
    const step: LiveStep = {
      tool: th.toolName ?? '',
      detail: summarizeToolInput(th.toolName ?? '', th.toolInput),
      startedAt: openSteps[i]?.startedAt ?? now,
      endedAt: now,
      input: th.toolInput ? JSON.stringify(th.toolInput) : undefined,
      output: th.toolResult?.output,
      failed: th.isError || th.toolResult?.isError || undefined,
    };
    if (i < openSteps.length) closed.push(step);
    else missed.push(step);
  });
  const orphans = openSteps
    .slice(toolThoughts.length)
    .map((s) => ({ ...s, endedAt: s.endedAt ?? now }));

  const result: LiveStep[] = [];
  let spliced = false;
  for (const s of steps) {
    if (isOpenTool(s)) {
      if (!spliced) {
        result.push(...thinkSteps, ...closed, ...orphans);
        spliced = true;
      }
      continue;
    }
    result.push(s);
  }
  if (!spliced) result.push(...thinkSteps);
  result.push(...missed);
  return { steps: result };
}

/**
 * 把轮次缓冲组装成一条助手消息，可能为空。
 *
 * turn_complete 正常组装与 aborted / error 的半截冲刷共用。
 * - 最终回答的 content 同时存在于缓冲与最后一条 text thought，
 *   组装时移除该 thought 避免重复展示
 * - aborted 为 true 时打中止标记，保留已到达的部分内容
 * - 缓冲全空时返回空数组，不产空泡
 * @param state - 目标 session 的聊天状态
 * @param aborted - 是否按中止冲刷处理
 * @returns 待追加的助手消息数组
 */
function assemblePendingBubble(
  state: SessionChatState,
  aborted = false
): UIMessage[] {
  if (!state.pendingContent && state.pendingThoughts.length === 0) return [];
  const finalThoughts = stripLastTextThought(state.pendingThoughts);
  return [
    {
      id: crypto.randomUUID(),
      type: 'assistant',
      content: state.pendingContent,
      timestamp: new Date(),
      thoughts: finalThoughts.length > 0 ? finalThoughts : undefined,
      aborted: aborted || undefined,
    },
  ];
}

/** 轮次缓冲与时间线的复位态，供切换生成态与回合结束时复位 */
function emptyPending(): Pick<
  SessionChatState,
  'pendingThoughts' | 'pendingContent' | 'armedCacheRefresh' | 'liveRun'
> {
  return {
    pendingThoughts: [],
    pendingContent: '',
    armedCacheRefresh: false,
    liveRun: null,
  };
}

/**
 * 将 session 切到生成态。
 * 用于用户发消息以及 App 通知/恢复订阅触发的外部回合——
 * isLoading 置位后，步骤事件进轮次缓冲，turn_complete 到达时组装整轮气泡，
 * liveRun 同步开空时间线供顶栏时间线驱动。
 */
function withLoadingState(sessionState: SessionChatState): SessionChatState {
  return {
    ...sessionState,
    ...emptyPending(),
    isLoading: true,
    liveRun: { steps: [] },
  };
}

/** 单个 session 的聊天状态 */
interface SessionChatState {
  messages: UIMessage[];
  isLoading: boolean;
  /** 当前轮的步骤缓冲，轮末组装成一条助手消息 */
  pendingThoughts: Thought[];
  pendingContent: string;
  /** 错过步骤事件的轮次由空缓冲 turn_complete 武装，round_complete 后从磁盘整包刷新 */
  armedCacheRefresh: boolean;
  /** 回合运行期的实时时间线缓冲，步骤事件推进，轮末随气泡组装清空，null 表示空闲 */
  liveRun: LiveRunState | null;
}

interface ChatStore {
  sessionStates: Map<string, SessionChatState>;
  currentSessionId: string | null;
  connectionStatus: ConnectionStatus;
  /** 镜像追平状态，来自同步引擎的状态回调 */
  syncState: SyncState;
  agentId: string | null;
  wsClient: WebSocketClient | null;
  /**
   * 运行中会话的全局集合，run_started 与 run_ended 广播维护，
   * runs_snapshot 整体替换，信号位运行腿与本机 isLoading 取或。
   */
  runningSessions: string[];
  /**
   * 运行归属的单一数据源，sessionId 指向 agentId，
   * runningSessions 与 runningAgents 都从这里推导。
   */
  runningOwners: Map<string, string>;
  /** 运行中 Agent 的全局集合，头像运行圈据此起转停转 */
  runningAgents: string[];

  setCurrentSessionId: (id: string | null) => void;
  initSessionState: (sessionId: string, messages: UIMessage[]) => void;
  sendMessage: (content: string, sessionId?: string) => Promise<void>;
  abortGeneration: (sessionId?: string) => void;
  subscribeSession: (sessionId: string) => void;
  /** 读缓存重载指定会话的消息，生成中的会话不应调用 */
  refreshSessionMessages: (sessionId: string) => Promise<void>;
  handleWsMessage: (msg: ServerMessage) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setSyncState: (state: SyncState) => void;
  setAgentId: (id: string | null) => void;
  setWsClient: (client: WebSocketClient | null) => void;
}

/** 从归属表推导会话与 Agent 两个运行集合，运行族事件的维护只改 owners 一处 */
function deriveRunning(owners: Map<string, string>) {
  return {
    runningSessions: [...owners.keys()],
    runningAgents: [...new Set(owners.values())],
  };
}

export const useChatStore = create<ChatStore>((set, get) => {
  /**
   * 从本地缓存重新拉取指定 session 的消息列表。
   * 用于 isGenerating 恢复场景：complete 事件到达时本地没有流式内容，
   * 需要读缓存里最终落盘的完整消息，缓存由同步引擎随变更流维护。
   */
  async function refreshSessionMessages(sessionId: string): Promise<void> {
    const agentId = get().agentId;
    if (!agentId) {
      logger.warn('Cannot refresh: no agentId', { sessionId });
      return;
    }
    try {
      const session = (await window.api?.cache.getSession(sessionId)) ?? null;
      if (!session) {
        logger.warn('Cannot refresh: session not in cache', { sessionId });
        return;
      }
      const converted = useSessionStore
        .getState()
        .convertSessionMessages(session.messages);
      set((state) => {
        const newStates = new Map(state.sessionStates);
        const ss = newStates.get(sessionId);
        if (ss) {
          newStates.set(sessionId, { ...ss, messages: converted });
        }
        return { sessionStates: newStates };
      });
      logger.info('Session messages refreshed from cache', { sessionId });
    } catch (err) {
      logger.error('Failed to refresh session messages', {
        sessionId,
        error: getErrorMessage(err),
      });
    }
  }

  return {
    sessionStates: new Map(),
    currentSessionId: null,
    connectionStatus: 'connecting',
    syncState: 'idle',
    agentId: null,
    wsClient: null,
    runningSessions: [],
    runningOwners: new Map(),
    runningAgents: [],

    setConnectionStatus: (status: ConnectionStatus) => {
      set({ connectionStatus: status });
    },

    setSyncState: (state: SyncState) => {
      set({ syncState: state });
    },

    setCurrentSessionId: (id: string | null) => {
      set({ currentSessionId: id });
    },

    refreshSessionMessages,

    initSessionState: (sessionId: string, messages: UIMessage[]) => {
      set((state) => {
        const newStates = new Map(state.sessionStates);
        newStates.set(sessionId, {
          messages,
          isLoading: false,
          ...emptyPending(),
        });
        return { sessionStates: newStates };
      });
    },

    setAgentId: (id: string | null) => {
      set({ agentId: id });
    },

    setWsClient: (client: WebSocketClient | null) => {
      set({ wsClient: client });
    },

    sendMessage: async (content: string, explicitSessionId?: string) => {
      const state = get();
      const sessionId = explicitSessionId || state.currentSessionId;
      const agentId = state.agentId;
      const { connectionStatus, wsClient } = state;

      if (!agentId || !sessionId) {
        toast.error('No agent or session selected');
        return;
      }

      if (connectionStatus !== 'connected') {
        set((state) => {
          const newStates = new Map(state.sessionStates);
          const sessionState = newStates.get(sessionId) || {
            messages: [],
            isLoading: false,
            ...emptyPending(),
          };
          newStates.set(sessionId, {
            messages: [
              ...sessionState.messages,
              createMessage('user', content),
              createMessage(
                'error',
                'Cannot connect to server. Please ensure Agent Server is running.'
              ),
            ],
            isLoading: false,
            ...emptyPending(),
          });
          return { sessionStates: newStates };
        });
        toast.error('Cannot connect to server');
        return;
      }

      // 忙时插话：消息进服务端待注入缓冲，灰气泡由 pending_input_changed 广播渲染。
      // 不提前上屏，发送失败也就没有需要回滚的本地状态
      if (get().sessionStates.get(sessionId)?.isLoading) {
        useSessionStore
          .getState()
          .updateSessionPreview(sessionId, buildPreviewText(content));
        wsClient?.subscribe(sessionId);

        try {
          const voiceEnabled = useVoiceStore.getState().voiceEnabled;
          const result = await sendChatMessage(
            agentId,
            sessionId,
            content,
            voiceEnabled
          );
          if (result.success) {
            logger.info('Interjection sent while generating', {
              sessionId,
              pendingId: result.pendingId,
            });
          } else {
            logger.warn('Interjection rejected', {
              sessionId,
              error: result.error,
            });
            toast.error(i18n.t('inputBox.queueFailed'));
          }
        } catch {
          toast.error(i18n.t('inputBox.queueFailed'));
        }
        return;
      }

      // 乐观追加用户消息并切生成态，助手气泡由 turn_complete 从轮次缓冲组装
      set((state) => {
        const newStates = new Map(state.sessionStates);
        const sessionState = newStates.get(sessionId) || {
          messages: [],
          isLoading: false,
          ...emptyPending(),
        };
        newStates.set(sessionId, {
          ...withLoadingState(sessionState),
          messages: [...sessionState.messages, createMessage('user', content)],
        });
        return { sessionStates: newStates };
      });
      logger.info('Message sent, loading state entered', { sessionId });

      // 同步更新会话预览
      useSessionStore
        .getState()
        .updateSessionPreview(sessionId, buildPreviewText(content));

      wsClient?.subscribe(sessionId);

      /** 失败回滚：结束生成态并清空轮次缓冲，乐观用户消息保留 */
      const rollbackLoading = () =>
        set((state) => {
          const newStates = new Map(state.sessionStates);
          const sessionState = newStates.get(sessionId);
          if (sessionState) {
            newStates.set(sessionId, {
              ...sessionState,
              isLoading: false,
              ...emptyPending(),
            });
          }
          return { sessionStates: newStates };
        });

      try {
        const voiceEnabled = useVoiceStore.getState().voiceEnabled;
        const result = await sendChatMessage(
          agentId,
          sessionId,
          content,
          voiceEnabled
        );
        if (!result.success) {
          rollbackLoading();
        }
      } catch {
        rollbackLoading();
      }
    },

    abortGeneration: (explicitSessionId?: string) => {
      const sessionId = explicitSessionId || get().currentSessionId;
      if (!sessionId) return;
      get().wsClient?.abort(sessionId);
      logger.info('Abort requested', { sessionId });
    },

    subscribeSession: (sessionId: string) => {
      get().wsClient?.subscribe(sessionId);
    },

    /**
     * 处理 WebSocket 推送消息，按 sessionId 路由到对应 session 的状态。
     * 所有 session 作用域事件均通过 msg.sessionId 定位 Map entry。
     */
    handleWsMessage: (msg: ServerMessage) => {
      switch (msg.type) {
        case 'run_started': {
          const sessionId = msg.sessionId;
          set((state) => {
            const newStates = new Map(state.sessionStates);
            const sessionState = newStates.get(sessionId);
            // 已加载的会话补建空时间线，远端发起的回合在本端立即显示思考中
            if (sessionState) {
              newStates.set(sessionId, {
                ...sessionState,
                liveRun: { steps: [] },
              });
            }
            // 幂等登记归属,广播重放或快照竞态不产生重复成员
            const owners = new Map(state.runningOwners);
            owners.set(sessionId, msg.agentId);
            return {
              runningOwners: owners,
              ...deriveRunning(owners),
              sessionStates: newStates,
            };
          });
          logger.info('[live-strip] Run started, timeline armed', {
            sessionId,
            agentId: msg.agentId,
          });
          break;
        }

        case 'run_ended': {
          set((state) => {
            const owners = new Map(state.runningOwners);
            owners.delete(msg.sessionId);
            return { runningOwners: owners, ...deriveRunning(owners) };
          });
          logger.info('Run ended', {
            sessionId: msg.sessionId,
            agentId: msg.agentId,
          });
          break;
        }

        case 'runs_snapshot': {
          // 快照整体替换,晚接入与重连端据此对齐 server 运行全量
          const owners = new Map(
            msg.runs.map((run) => [run.sessionId, run.agentId])
          );
          set({ runningOwners: owners, ...deriveRunning(owners) });
          logger.info('Runs snapshot received', {
            count: msg.runs.length,
          });
          break;
        }

        case 'subscribed': {
          const sessionId = msg.sessionId;
          const activity = msg.currentActivity;
          if (msg.isGenerating) {
            set((state) => {
              const newStates = new Map(state.sessionStates);
              const sessionState = newStates.get(sessionId);
              // 只增不减：仅在当前未加载时恢复，避免与 sendMessage 已切入的生成态冲突
              if (sessionState && !sessionState.isLoading) {
                newStates.set(sessionId, {
                  ...withLoadingState(sessionState),
                  // tool 态当前动作直接开活动工具步，中途接入立即显示执行中身份
                  liveRun:
                    activity?.kind === 'tool'
                      ? {
                          steps: [
                            {
                              tool: activity.toolName,
                              detail: activity.paramSummary,
                              startedAt: Date.now(),
                            },
                          ],
                        }
                      : { steps: [] },
                });
              }
              return { sessionStates: newStates };
            });
            logger.info('[live-strip] Generating restored via subscribe', {
              sessionId,
              activity: activity?.kind ?? 'thinking',
            });
          } else {
            logger.info('Subscribed to session:', sessionId);
          }
          break;
        }

        case 'app_notification': {
          // 外部（App）触发的回合：与用户发消息一样切生成态，
          // 首步 step_complete 现场创建助手消息并填入，而非被 isLoading 守卫丢弃
          const sessionId = msg.sessionId;
          set((state) => {
            const newStates = new Map(state.sessionStates);
            const sessionState = newStates.get(sessionId);
            if (sessionState && !sessionState.isLoading) {
              newStates.set(sessionId, withLoadingState(sessionState));
            }
            return { sessionStates: newStates };
          });
          logger.info('App notification received', {
            sessionId,
            source: msg.source,
          });
          break;
        }

        case 'pending_input_changed': {
          // 待注入缓冲全量同步：未知条目补灰气泡，注入取空时灰气泡转正常
          const sessionId = msg.sessionId;
          set((state) => {
            const newStates = new Map(state.sessionStates);
            const sessionState = newStates.get(sessionId);
            if (!sessionState) return {};
            const pendingIds = new Set(msg.pending.map((p) => p.id));
            // 灰气泡随广播创建并自带 pendingId，不在服务端列表即已注入
            const messages = sessionState.messages.map((m) =>
              m.queued && m.pendingId && !pendingIds.has(m.pendingId)
                ? { ...m, queued: false }
                : m
            );
            // 服务端有而本地没有的条目：本窗口刚发的与其他客户端写入的插话，补灰气泡；
            // app 来源的通知不在聊天窗口显示，直接过滤
            const localPendingIds = new Set(
              messages
                .filter((m) => m.pendingId)
                .map((m) => m.pendingId as string)
            );
            const additions = msg.pending
              .filter((p) => !localPendingIds.has(p.id) && p.source !== 'app')
              .map((p) =>
                createMessage('user', p.content, {
                  queued: true,
                  pendingId: p.id,
                  source: p.source === 'app' ? ('app' as const) : undefined,
                  sourceName: p.sourceName,
                })
              );
            newStates.set(sessionId, {
              ...sessionState,
              messages: [...messages, ...additions],
            });
            return { sessionStates: newStates };
          });
          logger.info('Pending inputs synced', {
            sessionId,
            pendingCount: msg.pending.length,
            appFiltered: msg.pending.filter((p) => p.source === 'app').length,
          });
          break;
        }

        case 'tool_started': {
          const sessionId = msg.sessionId;
          const sessionState = get().sessionStates.get(sessionId);
          // 迟到守卫：回合未在进行中即丢弃，不污染空闲时间线
          if (!sessionState?.isLoading) {
            logger.info('Late tool_started ignored', { sessionId });
            break;
          }
          const startedAt = Date.now();
          set((state) => {
            const newStates = new Map(state.sessionStates);
            const ss = newStates.get(sessionId);
            if (!ss) return {};
            newStates.set(sessionId, {
              ...ss,
              liveRun: {
                steps: [
                  ...(ss.liveRun?.steps ?? []),
                  {
                    tool: msg.toolName,
                    detail: msg.paramSummary,
                    startedAt,
                  },
                ],
              },
            });
            return { sessionStates: newStates };
          });
          logger.info('[live-strip] Tool started', {
            sessionId,
            stepIndex: msg.stepIndex,
            toolName: msg.toolName,
          });
          break;
        }

        case 'step_complete': {
          const sessionId = msg.sessionId;
          const newThoughts = cycleToThoughts(msg);

          if (msg.toolCalls) {
            for (const tc of msg.toolCalls) {
              if (tc.name === 'show_pose' && tc.arguments) {
                const pose = tc.arguments.pose as string;
                const result = msg.toolResults?.find(
                  (tr) => tr.toolCallId === tc.id
                );
                if (pose && result?.success) {
                  useCompanionStore.getState().setPose(pose, true);
                }
              }
            }
          }

          // 在 set 回调外读取当前 sessionState，避免在回调内调用 get()
          const currentSnap = get();
          const sessionState = currentSnap.sessionStates.get(sessionId);
          if (sessionState) {
            // 防御：本回合已结束后迟到的 step_complete 直接丢弃，不污染下一轮缓冲
            if (!sessionState.isLoading) {
              logger.info('Late step_complete ignored', { sessionId });
              break;
            }

            // 步骤进轮次缓冲与实时时间线，界面无中间助手内容，
            // turn_complete 到达时整轮组装，liveRun 惰性创建覆盖续跑轮次
            const mergedLiveRun = mergeStepIntoLiveRun(
              sessionState.liveRun,
              newThoughts
            );
            set((state) => {
              const newStates = new Map(state.sessionStates);
              const ss = newStates.get(sessionId);
              if (!ss) return {};
              newStates.set(sessionId, {
                ...ss,
                pendingThoughts: [...ss.pendingThoughts, ...newThoughts],
                pendingContent: msg.content || ss.pendingContent,
                liveRun: mergedLiveRun,
              });
              return { sessionStates: newStates };
            });
            logger.info('[live-strip] Step merged', {
              sessionId,
              stepIndex: msg.stepIndex,
              timelineSteps: mergedLiveRun.steps.length,
            });

            // 同步更新会话预览
            useSessionStore
              .getState()
              .updateSessionPreview(
                sessionId,
                buildPreviewText(msg.content || '')
              );
          }
          break;
        }

        case 'turn_complete': {
          const sessionId = msg.sessionId;
          const sessionState = get().sessionStates.get(sessionId);
          if (!sessionState) break;

          const bubble = assemblePendingBubble(sessionState);

          // 空缓冲说明重载后错过了本轮步骤事件，武装刷新标志，
          // round_complete 后从磁盘整包刷新，不打断其他客户端仍在收的后续轮次
          if (bubble.length === 0) {
            set((state) => {
              const newStates = new Map(state.sessionStates);
              const ss = newStates.get(sessionId);
              if (ss) {
                newStates.set(sessionId, {
                  ...ss,
                  ...emptyPending(),
                  armedCacheRefresh: true,
                });
              }
              return { sessionStates: newStates };
            });
            logger.info('Turn end with empty buffer, arming disk refresh', {
              sessionId,
            });
            break;
          }

          // 组装整轮气泡追加到末尾，追加天然形成聊天顺序，插话灰气泡排在整轮之上
          // 时间线步骤随组装迁入消息流，liveRun 清空避免同批步骤重复出现
          set((state) => {
            const newStates = new Map(state.sessionStates);
            const ss = newStates.get(sessionId);
            if (ss) {
              newStates.set(sessionId, {
                ...ss,
                messages: [...ss.messages, ...bubble],
                pendingThoughts: [],
                pendingContent: '',
                liveRun: null,
              });
            }
            return { sessionStates: newStates };
          });
          logger.info('Turn bubble assembled', {
            sessionId,
            thoughtCount: bubble[0]?.thoughts?.length ?? 0,
            contentLength: bubble[0]?.content.length ?? 0,
          });
          break;
        }

        case 'round_complete': {
          const sessionId = msg.sessionId;
          const snap = get();
          const sessionState = snap.sessionStates.get(sessionId);
          if (!sessionState) break;
          const needsRefresh = sessionState.armedCacheRefresh;

          set((state) => {
            const newStates = new Map(state.sessionStates);
            const ss = newStates.get(sessionId);
            if (ss) {
              newStates.set(sessionId, {
                ...ss,
                isLoading: false,
                ...emptyPending(),
              });
            }
            return { sessionStates: newStates };
          });

          if (needsRefresh) {
            logger.info('Round complete, refreshing from disk', { sessionId });
            void refreshSessionMessages(sessionId);
          } else {
            logger.info('Round complete', { sessionId });
          }
          break;
        }

        case 'speak_ready': {
          if (msg.sessionId !== get().currentSessionId) break;
          const { voiceEnabled, speak } = useVoiceStore.getState();
          if (voiceEnabled) {
            void speak(
              msg.speakText,
              msg.voiceId,
              msg.apiKey,
              msg.model,
              msg.languageBoost
            );
          }
          break;
        }

        case 'speak_error': {
          toast.warning(msg.message);
          break;
        }

        case 'workspace_fallback': {
          // 工作目录失效已被写回配置：提示用户并刷新 Agent 与会话的路径显示
          toast.warning(
            i18n.t('workspace.fallbackNotice', { path: msg.fallbackPath })
          );
          void useAgentStore.getState().loadAgents();
          void useSessionStore.getState().loadSessions(msg.agentId);
          break;
        }

        case 'error': {
          const sessionId = msg.sessionId;
          set((state) => {
            const newStates = new Map(state.sessionStates);
            const sessionState = newStates.get(sessionId);
            if (sessionState) {
              // 缓冲冲刷成半截气泡再退出，与刷新链路的 error 结组口径一致
              newStates.set(sessionId, {
                ...sessionState,
                messages: [
                  ...sessionState.messages,
                  ...assemblePendingBubble(sessionState),
                  createMessage('error', msg.message),
                ],
                isLoading: false,
                ...emptyPending(),
              });
            }
            return { sessionStates: newStates };
          });
          logger.info('Turn errored, partial flushed', { sessionId });
          break;
        }

        case 'aborted': {
          const sessionId = msg.sessionId;
          set((state) => {
            const newStates = new Map(state.sessionStates);
            const sessionState = newStates.get(sessionId);
            if (sessionState) {
              // 缓冲冲刷成带中止标记的半截气泡，保留部分内容
              newStates.set(sessionId, {
                ...sessionState,
                messages: [
                  ...sessionState.messages,
                  ...assemblePendingBubble(sessionState, true),
                ],
                isLoading: false,
                ...emptyPending(),
              });
            }
            return { sessionStates: newStates };
          });
          logger.info('Turn aborted, partial flushed', { sessionId });
          break;
        }

        case 'title_updated':
          logger.info('Title updated:', msg.title);
          useSessionStore
            .getState()
            .updateSessionTitleLocally(msg.sessionId, msg.title);
          break;
      }
    },
  };
});
