/**
 * @fileoverview HTTP server setup for persona-agent server.
 *
 */

import express from 'express';
import cors from 'cors';
import type { Request, Response } from 'express';
import { createServer as createHttpServer } from 'http';
import { Logger } from '../util/logger.js';
import { createProviderRouter, createAuthRouter } from './routers/auth.js';
import { createAgentRouter, type SessionManagersMap } from './routers/agent.js';
import { createSessionRouter } from './routers/session.js';
import { createChatRouter } from './routers/chat.js';
import { createTtsRouter } from './routers/tts.js';
import { createVoiceRouter } from './routers/voice.js';
import { createConfigRouter } from './routers/config.js';
import { createSkillRouter } from './routers/skill.js';
import { createMcpRouter } from './routers/mcp.js';
import { createToolsRouter } from './routers/tools.js';
import { createMarketplaceRouter } from './routers/marketplace.js';
import { createTunnelRouter } from './routers/tunnel.js';
import { createPairRouter } from './routers/pair.js';
import { createRuntimesRouter } from './routers/runtimes.js';
import { createAssetsRouter } from './routers/assets.js';
import { createAvatarRouter } from './routers/avatar.js';
import { createChangesRouter } from './routers/changes.js';
import { createHandshakeRouter } from './routers/handshake.js';
import { createDeviceRouter } from './routers/device.js';
import { createAttachmentRouter } from './routers/attachment.js';
import { createSyncRouter } from './routers/sync.js';
import { createLauncherRouter } from './routers/launcher.js';
import { errorHandler } from './routers/utils.js';
import { processAppNotification } from './services/app-notification-service.js';
import {
  sessionContextSnapshot,
  refreshUsageSnapshot,
  forgetUsageSnapshot,
} from './services/usage-service.js';
import { sessionChangeEmitter } from '../session/changes.js';
import type { SessionChange } from '@persona/shared';
import {
  initWebSocket,
  isWebSocketInitialized,
  setViewedHandler,
  setContextUsageProvider,
} from './websocket-server.js';

import { listAgentConfigs } from '../agent/index.js';
import { initSkillPool } from '../skill/index.js';
import { initMcpPool, setAppNotificationHandler } from '../mcp/index.js';
import { appProxyMiddleware, handleAppWsUpgrade } from '../mcp/app-proxy.js';
import { SessionStore } from '../session/store.js';
import { SessionManager } from '../session/session-manager.js';
import { findGitBash } from '../util/git-bash-detector.js';
import { getRuntimesDir } from '../util/paths.js';
import * as nodePath from 'node:path';

// 将 runtimes 目录注入 PATH，使 MCP 子进程能按名字 "uv" 找到二进制。
// 必须在 initMcpPool 之前执行，因为 MCP 连接时会 spawn 子进程。
const runtimesDir = getRuntimesDir();
process.env['PATH'] =
  runtimesDir + nodePath.delimiter + (process.env['PATH'] ?? '');
Logger.log('SERVER', `Injected runtimes dir into PATH: ${runtimesDir}`);

const app = express();
app.use(cors());
// Proxy before express.json() so raw request bodies are preserved
app.use(appProxyMiddleware);
app.use(express.json());

app.use((req, _res, next) => {
  Logger.log('HTTP', `${req.method} ${req.path}`);
  next();
});

app.get('/api/status', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    message: 'Agent Server is running',
  });
});

app.get('/health', (_req: Request, res: Response) => {
  const bashPath = findGitBash();
  res.json({
    alive: true,
    timestamp: Date.now(),
    requirements: {
      bash: {
        ok: bashPath !== null,
        path: bashPath,
      },
    },
  });
});

/** Global session managers map */
const sessionManagers: SessionManagersMap = new Map();

/**
 * 给所有Agent创建对应的SessionStore, 然后保存在SessionManagersMap映射关系。
 * 同时为每个 Agent 补建聊天 Session。
 */
function initSessionManagers(): void {
  const agentConfigs = listAgentConfigs();
  for (const agentConfig of agentConfigs) {
    const store = new SessionStore(agentConfig.id);
    const manager = new SessionManager(store, agentConfig.id);
    sessionManagers.set(agentConfig.id, manager);

    // 为没有Chat的Agent补建Chat
    if (!manager.getSession(manager.chatSessionId())) {
      manager.createChatSession();
    }
  }
  Logger.log('SERVER', `Initialized ${agentConfigs.length} session managers`);
}

initSessionManagers();
initSkillPool();

// 注册 Agent App 通知回调，必须在 initMcpPool 之前
setAppNotificationHandler((params, serverName) => {
  processAppNotification(params, serverName, sessionManagers).catch((err) => {
    Logger.log(
      'MCP-APP',
      `Notification handling failed: ${(err as Error).message}`
    );
  });
});

void initMcpPool();
Logger.setSessionManagers(sessionManagers);

/** 按会话 id 找属主 manager，普通会话 id 不编码 agentId，只能逐个问询 */
function managerForSession(sessionId: string): SessionManager | undefined {
  for (const manager of sessionManagers.values()) {
    if (manager.getSession(sessionId)) return manager;
  }
  return undefined;
}

/**
 * 圈定一次失效信号该刷的 manager 列表。
 *
 * agents_invalidated 带 agentId 只取对应 manager，tools_invalidated
 * 带 agentIds 逐个取，data 为空的注册表全局变化与旧格式事件兜底刷
 * 全部，宁多刷不漏刷。查不到的 agentId 静默跳过，Agent 删除后
 * manager 可能已不在表。
 */
function usageRefreshManagers(change: SessionChange): SessionManager[] {
  if (change.kind === 'agents_invalidated') {
    const agentId = (change.data as { agentId?: string } | null)?.agentId;
    if (!agentId) return [...sessionManagers.values()];
    const manager = sessionManagers.get(agentId);
    return manager ? [manager] : [];
  }
  const agentIds = (change.data as { agentIds?: string[] } | null)?.agentIds;
  if (!agentIds?.length) return [...sessionManagers.values()];
  return agentIds
    .map((id) => sessionManagers.get(id))
    .filter((manager): manager is SessionManager => manager != null);
}

// 未读清除回调,viewed 上报经此落到对应 Agent 的 manager,
// 置 false 落库后由变更流广播到全部在线端,任何一端看过即全局看过
setViewedHandler((sessionId) => {
  for (const manager of sessionManagers.values()) {
    if (manager.updateHasUnread(sessionId, false)) return;
  }
  Logger.log('SERVER', `Viewed session not found: ${sessionId}`);
});
// 占用快照补态回调:经属主查找取会话现算快照
setContextUsageProvider((sessionId) => {
  const manager = managerForSession(sessionId);
  return manager ? sessionContextSnapshot(manager, sessionId) : null;
});

// 占用刷新订阅：装配输入变化后现算快照经统一出口推送。失效信号带
// 变更主语，经圈定函数只刷受影响 Agent 的会话，data 为空的注册表
// 全局变化与旧格式事件兜底刷全部。刷新全程不写库，写库会再发
// session_updated 形成回环，不写库天然无环。消息追加只发
// message_appended 不在此列，刷新只认配置与元信息变化。
sessionChangeEmitter.on('change', (change: SessionChange) => {
  if (
    change.kind === 'agents_invalidated' ||
    change.kind === 'tools_invalidated'
  ) {
    for (const manager of usageRefreshManagers(change)) {
      for (const meta of manager.listSessions()) {
        refreshUsageSnapshot(meta.id, manager, change.kind);
      }
    }
    return;
  }
  if (change.kind === 'session_updated' && change.sessionId) {
    const manager = managerForSession(change.sessionId);
    if (manager) {
      refreshUsageSnapshot(change.sessionId, manager, change.kind);
    }
    return;
  }
  if (change.kind === 'session_deleted' && change.sessionId) {
    forgetUsageSnapshot(change.sessionId);
  }
});

app.use('/api/providers', createProviderRouter());
app.use('/api/auth', createAuthRouter());
app.use('/api/config', createConfigRouter());
app.use('/api/skills', createSkillRouter());
app.use('/api/mcp', createMcpRouter());
app.use('/api/tools', createToolsRouter());
app.use('/api/marketplace', createMarketplaceRouter(sessionManagers));
app.use('/api/runtimes', createRuntimesRouter());
app.use('/api/tunnel', createTunnelRouter());
app.use('/api/pair', createPairRouter());
app.use('/api/agents', createAgentRouter(sessionManagers));
app.use('/api/agents/:agentId/assets', createAssetsRouter());
app.use('/api/agents/:agentId/avatar', createAvatarRouter());
app.use('/api/agents/:agentId/sessions', createSessionRouter(sessionManagers));
app.use(
  '/api/agents/:agentId/sessions/:sessionId/chat',
  createChatRouter(sessionManagers)
);
app.use('/api/tts', createTtsRouter());
app.use('/api/voices', createVoiceRouter());
app.use('/api/changes', createChangesRouter());
app.use('/api/handshake', createHandshakeRouter());
app.use('/api/devices', createDeviceRouter());
app.use('/api/attachments', createAttachmentRouter());
app.use('/api/sync', createSyncRouter());
app.use('/api/launcher', createLauncherRouter());

const httpServer = createHttpServer(app);

/**
 * 全局错误处理中间件定义在 routers/utils.ts，与 asyncHandler 同居，
 * 这里挂到路由之后兜底未被捕获的异常。
 */
app.use(errorHandler);

// Initialize WebSocket server
if (!isWebSocketInitialized()) {
  initWebSocket(httpServer);
}
// Forward /apps/ WebSocket upgrades to Agent App servers
httpServer.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/apps/')) {
    handleAppWsUpgrade(req, socket, head);
  }
});

export { httpServer };
