/**
 * WebSocket 消息协议 — desktop 与 server 之间的实时通信契约。
 *
 * ServerMessage 是 server→client 的 closed union，替换了服务端原来开放的 WSEvent。
 * ClientMessage 是 client→server 的 closed union，让 handleClientMessage 不再需要 as 强转。
 */

/** 设备类型，用于设备身份注册 */
export type DeviceType = 'desktop' | 'mobile';

import type { SessionChange } from './changes.js';

// ── Server → Client 事件 ──

interface ConnectedMessage {
  type: 'connected';
  clientId: string;
  /** 服务端保活节拍毫秒数，缺失表示旧服务端不发保活，客户端看门狗据此决定是否武装 */
  keepaliveIntervalMs?: number;
}

interface SubscribedMessage {
  type: 'subscribed';
  sessionId: string;
  /** 该 session 是否正在生成，前端据此恢复加载状态 */
  isGenerating?: boolean;
  /** 生成中会话的当前动作，中途接入端据此立即显示工具执行或思考中 */
  currentActivity?: CurrentActivity;
}

/** 运行中会话的当前动作，subscribed 携带，thinking 与 tool 两态 */
export type CurrentActivity =
  | { kind: 'thinking' }
  | {
      kind: 'tool';
      stepIndex: number;
      toolName: string;
      paramSummary: string;
    };

/**
 * 工具调用开始事件。
 * Agent 开始执行单个工具时即时广播，UI 据此显示执行中的工具身份，
 * 不进步骤聚合，步骤落盘口径不变。
 */
interface ToolStartedMessage {
  type: 'tool_started';
  sessionId: string;
  stepIndex: number;
  toolName: string;
  /** 入参经掩码与摘要压成的一句参数摘要 */
  paramSummary: string;
  /** 子代理工具链路的挂载点，当前无写入方，演进预留 */
  parent_tool_use_id?: string;
}

interface WsToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface WsToolResult {
  toolCallId: string;
  toolName: string;
  result: string;
  success: boolean;
}

export interface StepCompleteMessage {
  type: 'step_complete';
  sessionId: string;
  stepIndex: number;
  thinking?: string;
  content?: string;
  toolCalls?: WsToolCall[];
  toolResults?: WsToolResult[];
  /** 子代理工具链路的挂载点，当前无写入方，演进预留 */
  parent_tool_use_id?: string;
}

/**
 * 回合边界信号。
 * 回合的工作结束时广播，出错路径随 error 一起发出，用户中止走 aborted。
 */
interface RoundCompleteMessage {
  type: 'round_complete';
  sessionId: string;
}

/**
 * 轮次边界信号。
 * 续跑判定处缓冲非空决定续跑下一轮时广播，客户端据此关闭当前轮气泡，
 * 生成状态保持，下一轮首条 step_complete 创建新气泡。
 */
interface TurnCompleteMessage {
  type: 'turn_complete';
  sessionId: string;
}

interface ErrorMessage {
  type: 'error';
  sessionId: string;
  message: string;
}

interface TitleUpdatedMessage {
  type: 'title_updated';
  sessionId: string;
  title: string;
}

interface SpeakReadyMessage {
  type: 'speak_ready';
  sessionId: string;
  speakText: string;
  voiceId: string;
  apiKey: string;
  model: string;
  languageBoost?: string;
}

type SpeakErrorReason =
  | 'no_api_key'
  | 'no_voice_id'
  | 'no_content'
  | 'voice_not_found';

interface SpeakErrorMessage {
  type: 'speak_error';
  sessionId: string;
  reason: SpeakErrorReason;
  message: string;
}

interface PongMessage {
  type: 'pong';
}

/**
 * 服务端向下行空闲的连接发送的保活心跳。
 * 协议层探测回复对客户端脚本不可见，看门狗的新鲜度判定只能依赖这条数据帧。
 */
interface KeepaliveMessage {
  type: 'keepalive';
}

interface PairRequestMessage {
  type: 'pair_request';
  deviceName: string;
  deviceId?: string;
  deviceType?: DeviceType;
  timestamp: number;
}

interface DeviceOnlineMessage {
  type: 'device_online';
  device: { deviceId: string; deviceType: DeviceType; deviceName: string };
}

interface DeviceOfflineMessage {
  type: 'device_offline';
  deviceId: string;
}

/** 服务端确认会话生成已被中止后推送的事件 */
interface AbortedMessage {
  type: 'aborted';
  sessionId: string;
  reason: string;
}

/**
 * App 通知触发的服务端回合开始信号。
 * 服务端在 Agent 循环开始前广播，客户端据此创建 AI 占位气泡并切换为生成状态。
 * 注意：这是 WS 事件，不是存储层消息；存储层的同名概念见 schema.ts 的
 * AppNotificationMessage（role: 'app_notification'），两者刻意区分命名。
 */
interface AppNotificationEvent {
  type: 'app_notification';
  sessionId: string;
  source: string;
  content: string;
}

/**
 * 用户消息落盘事件。
 * 空闲路径的普通用户消息持久化后广播，订阅了会话的客户端据此追加用户气泡，
 * 发起端已乐观追加，回声由客户端的运行态守卫拦截。
 */
interface UserMessageEvent {
  type: 'user_message';
  sessionId: string;
  content: string;
}

/**
 * 工作目录解析回退通知。
 * 用户显式配置的路径失效时由服务端广播：生效路径已写回配置，
 * 客户端据此提示用户并刷新 Agent 与会话显示。
 */
interface WorkspaceFallbackMessage {
  type: 'workspace_fallback';
  sessionId: string;
  agentId: string;
  fallbackPath: string;
}

/**
 * 忙时插话的缓冲条目。
 * 会话生成期间到达的用户消息与 App 通知进入待注入缓冲，步骤间隙统一取空注入。
 */
export interface PendingInput {
  id: string;
  source: 'user' | 'app';
  /** App 消息的来源显示名，入口处已从机器键解析，如 番茄时钟 */
  sourceName?: string;
  content: string;
}

/**
 * 待注入缓冲变化事件。
 * 缓冲写入与取空时广播全量列表，客户端据此同步灰气泡。
 */
interface PendingInputChangedMessage {
  type: 'pending_input_changed';
  sessionId: string;
  pending: PendingInput[];
}

/**
 * 变更流推送事件。
 * 服务端每次写库提交后广播，客户端按 seq 回放镜像或更新本地缓存。
 */
interface ChangeMessage {
  type: 'change';
  change: SessionChange;
}

/** 回合开始的全局广播，registry 登记时发往全部在线端，客户端据此点亮非订阅会话的运行信号与 Agent 运行圈 */
interface RunStartedMessage {
  type: 'run_started';
  sessionId: string;
  /** 运行会话的归属 Agent，头像运行圈据此起转 */
  agentId: string;
}

/** 回合结束的全局广播，registry 注销时发往全部在线端，完成、出错与中止共用此出口 */
interface RunEndedMessage {
  type: 'run_ended';
  sessionId: string;
  /** 结束会话的归属 Agent，与 run_started 对称携带 */
  agentId: string;
}

/** 运行中会话的带归属条目，Agent 级运行集合的数据源 */
export interface RunningSessionEntry {
  sessionId: string;
  agentId: string;
}

interface RunsSnapshotMessage {
  /** 连接建立时的运行中会话全量列表，晚接入与重连端据此补态，保留给旧端读取 */
  type: 'runs_snapshot';
  sessionIds: string[];
  /** 带归属的同一份全量，新端据此维护 Agent 级运行集合 */
  runs: RunningSessionEntry[];
}

export type ServerMessage =
  | ConnectedMessage
  | SubscribedMessage
  | StepCompleteMessage
  | ToolStartedMessage
  | TurnCompleteMessage
  | RoundCompleteMessage
  | ErrorMessage
  | TitleUpdatedMessage
  | SpeakReadyMessage
  | SpeakErrorMessage
  | PongMessage
  | KeepaliveMessage
  | PairRequestMessage
  | DeviceOnlineMessage
  | DeviceOfflineMessage
  | AbortedMessage
  | AppNotificationEvent
  | UserMessageEvent
  | WorkspaceFallbackMessage
  | PendingInputChangedMessage
  | RunStartedMessage
  | RunEndedMessage
  | RunsSnapshotMessage
  | ChangeMessage;

// ── Client → Server 消息 ──

interface RegisterMessage {
  type: 'register';
  deviceId: string;
  deviceType: DeviceType;
  deviceName: string;
}

export type ClientMessage =
  | { type: 'subscribe'; payload: { sessionId: string } }
  | { type: 'unsubscribe'; payload: { sessionId: string } }
  /** 进入会话的已读上报，服务端据此清除 hasUnread 并广播，幂等空写无害 */
  | { type: 'viewed'; payload: { sessionId: string } }
  | { type: 'ping' }
  | RegisterMessage
  | { type: 'abort'; payload: { sessionId: string } };
