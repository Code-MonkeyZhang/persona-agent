/**
 * @fileoverview Agent App 通知处理服务。
 *
 * 接收来自 MCP 连接的 notifications/app，做三一致校验后
 * 转成 app_notification 消息触发对应会话的 processChat。
 */

import type { SessionManager } from '../../session/session-manager.js';
import { getAgentConfig } from '../../agent/index.js';
import { processChat } from './chat-service.js';
import { Logger } from '../../util/logger.js';

/**
 * 处理 Agent App 通知。
 * - 校验通过后调用 processChat，以 app_notification 方式注入对话
 *
 * @param params - 通知参数，需包含 agentId/sessionId/source/content
 * @param serverName - 收到通知的 MCP 连接对应的 server 名
 * @param sessionManagers - 全局 SessionManager 映射
 */
export async function processAppNotification(
  params: Record<string, unknown>,
  serverName: string,
  sessionManagers: Map<string, SessionManager>
): Promise<void> {
  const agentId = params['agentId'];
  const sessionId = params['sessionId'];
  const source = params['source'];
  const content = params['content'];

  if (
    typeof agentId !== 'string' ||
    !agentId ||
    typeof sessionId !== 'string' ||
    !sessionId ||
    typeof source !== 'string' ||
    !source ||
    typeof content !== 'string' ||
    !content
  ) {
    Logger.log(
      'MCP-APP',
      `Invalid notification from '${serverName}': missing or empty fields`
    );
    return;
  }

  if (source !== serverName) {
    Logger.log(
      'MCP-APP',
      `Notification source mismatch: source='${source}', connection='${serverName}'`
    );
    return;
  }

  const agentConfig = getAgentConfig(agentId);
  if (!agentConfig) {
    Logger.log('MCP-APP', `Notification target agent not found: ${agentId}`);
    return;
  }

  if (!agentConfig.mcpNames?.includes(serverName)) {
    Logger.log(
      'MCP-APP',
      `Agent '${agentId}' does not use App '${serverName}'`
    );
    return;
  }

  const sessionManager = sessionManagers.get(agentId);
  if (!sessionManager) {
    Logger.log('MCP-APP', `No session manager for agent: ${agentId}`);
    return;
  }

  const session = sessionManager.getSession(sessionId);
  if (!session) {
    Logger.log(
      'MCP-APP',
      `Notification target session not found: ${sessionId}`
    );
    return;
  }

  Logger.log(
    'MCP-APP',
    `Delivering notification from '${serverName}' to session ${sessionId}`
  );

  // Agent 可能还在生成上一轮回复（重入保护会拒绝并发 processChat），
  // 因此遇到 "Session is currently generating" 时短暂等待后重试。
  const MAX_RETRIES = 10;
  const RETRY_DELAY_MS = 1000;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    const result = await processChat({
      agentId,
      sessionId,
      content,
      sessionManager,
      appSource: serverName,
    });

    if (result.success) return;

    if (result.error !== 'Session is currently generating') {
      Logger.log(
        'MCP-APP',
        `processChat failed for notification: ${result.error ?? 'unknown'}`
      );
      return;
    }

    Logger.log(
      'MCP-APP',
      `Session busy, retry ${attempt}/${MAX_RETRIES} in ${RETRY_DELAY_MS}ms`
    );
    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }

  Logger.log(
    'MCP-APP',
    `Notification delivery timed out after ${MAX_RETRIES} retries`
  );
}
