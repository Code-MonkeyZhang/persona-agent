/**
 * @fileoverview 聊天流 error 消息的落库与广播小助手。
 *
 * 聊天回合失败与压缩终态失败两处共用，客户端的红底气泡渲染现成。
 */

import type { SessionManager } from '../../session/session-manager.js';
import { broadcastToSession } from '../websocket-server.js';

/**
 * 落盘一条 error 消息并广播 error 事件。
 *
 * 不附带 round_complete，回合语义由调用方各自处理。
 */
export function appendChatErrorMessage(
  sessionManager: SessionManager,
  sessionId: string,
  content: string
): void {
  sessionManager.appendMessage(sessionId, { role: 'error', content });
  broadcastToSession(sessionId, {
    type: 'error',
    sessionId,
    message: content,
  });
}
