/**
 * WebSocket 消息协议 — desktop 与 server 之间的实时通信契约。
 *
 * ServerMessage 是 server→client 的 closed union，替换了服务端原来开放的 WSEvent。
 * ClientMessage 是 client→server 的 closed union，让 handleClientMessage 不再需要 as 强转。
 */

// ── Server → Client 事件 ──

export interface ConnectedMessage {
  type: 'connected';
  clientId: string;
}

export interface SubscribedMessage {
  type: 'subscribed';
  sessionId: string;
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
  timestamp: number;
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
  | PairRequestMessage;

// ── Client → Server 消息 ──

export type ClientMessage =
  | { type: 'subscribe'; payload: { sessionId: string } }
  | { type: 'unsubscribe'; payload: { sessionId: string } }
  | { type: 'ping' };
