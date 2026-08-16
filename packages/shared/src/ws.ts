/**
 * WebSocket 消息协议 — desktop 与 server 之间的实时通信契约。
 *
 * ServerMessage 是 server→client 的 closed union，替换了服务端原来开放的 WSEvent。
 * ClientMessage 是 client→server 的 closed union，让 handleClientMessage 不再需要 as 强转。
 */

/** 设备类型，用于设备身份注册 */
export type DeviceType = 'desktop' | 'mobile';

// ── Server → Client 事件 ──

export interface ConnectedMessage {
  type: 'connected';
  clientId: string;
}

export interface SubscribedMessage {
  type: 'subscribed';
  sessionId: string;
  /** 该 session 是否正在生成，前端据此恢复加载状态 */
  isGenerating?: boolean;
}

export interface WsToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface WsToolResult {
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
}

export interface CompleteMessage {
  type: 'complete';
  sessionId: string;
}

export interface ErrorMessage {
  type: 'error';
  sessionId: string;
  message: string;
}

export interface TitleUpdatedMessage {
  type: 'title_updated';
  sessionId: string;
  title: string;
}

export interface SpeakReadyMessage {
  type: 'speak_ready';
  sessionId: string;
  speakText: string;
  voiceId: string;
  apiKey: string;
  model: string;
  languageBoost?: string;
}

export type SpeakErrorReason =
  | 'no_api_key'
  | 'no_voice_id'
  | 'no_content'
  | 'voice_not_found';

export interface SpeakErrorMessage {
  type: 'speak_error';
  sessionId: string;
  reason: SpeakErrorReason;
  message: string;
}

export interface PongMessage {
  type: 'pong';
}

export interface PairRequestMessage {
  type: 'pair_request';
  deviceName: string;
  deviceId?: string;
  deviceType?: DeviceType;
  timestamp: number;
}

export interface DeviceOnlineMessage {
  type: 'device_online';
  device: { deviceId: string; deviceType: DeviceType; deviceName: string };
}

export interface DeviceOfflineMessage {
  type: 'device_offline';
  deviceId: string;
}

/** 服务端确认会话生成已被中止后推送的事件 */
export interface AbortedMessage {
  type: 'aborted';
  sessionId: string;
  reason: string;
}

/**
 * App 通知触发的服务端回合开始信号。
 * 服务端在 Agent 循环开始前广播，客户端据此创建 AI 占位气泡并切换为生成状态。
 */
export interface AppNotificationMessage {
  type: 'app_notification';
  sessionId: string;
  source: string;
  content: string;
}

export type ServerMessage =
  | ConnectedMessage
  | SubscribedMessage
  | StepCompleteMessage
  | CompleteMessage
  | ErrorMessage
  | TitleUpdatedMessage
  | SpeakReadyMessage
  | SpeakErrorMessage
  | PongMessage
  | PairRequestMessage
  | DeviceOnlineMessage
  | DeviceOfflineMessage
  | AbortedMessage
  | AppNotificationMessage;

// ── Client → Server 消息 ──

export interface RegisterMessage {
  type: 'register';
  deviceId: string;
  deviceType: DeviceType;
  deviceName: string;
}

export type ClientMessage =
  | { type: 'subscribe'; payload: { sessionId: string } }
  | { type: 'unsubscribe'; payload: { sessionId: string } }
  | { type: 'ping' }
  | RegisterMessage
  | { type: 'abort'; payload: { sessionId: string } };
