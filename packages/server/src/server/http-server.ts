/**
 * @fileoverview HTTP server setup for persona-agent server.
 *
 */

import express from 'express';
import cors from 'cors';
import type { Request, Response, ErrorRequestHandler } from 'express';
import { createServer as createHttpServer } from 'http';
import { Logger } from '../util/logger.js';
import { AppError } from '../util/errors.js';
import { createProviderRouter, createAuthRouter } from './routers/auth.js';
import { createAgentRouter, type SessionManagersMap } from './routers/agent.js';
import { createSessionRouter } from './routers/session.js';
import { createChatRouter } from './routers/chat.js';
import { createTtsRouter } from './routers/tts.js';
import { createVoiceRouter } from './routers/voice.js';
import { createConfigRouter } from './routers/config.js';
import { createSkillRouter } from './routers/skill.js';
import { createMcpRouter } from './routers/mcp.js';
import { createMarketplaceRouter } from './routers/marketplace.js';
import { createTunnelRouter } from './routers/tunnel.js';
import { createAssetsRouter } from './routers/assets.js';
import { createAvatarRouter } from './routers/avatar.js';
import { initWebSocket, isWebSocketInitialized } from './websocket-server.js';
import { startDreamScheduler } from './dream-scheduler.js';

import { listAgentConfigs } from '../agent/index.js';
import { initSkillPool } from '../skill/index.js';
import { initMcpPool } from '../mcp/index.js';
import { SessionStore } from '../session/store.js';
import { SessionManager } from '../session/session-manager.js';

const app = express();
app.use(cors());
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
  res.json({
    alive: true,
    timestamp: Date.now(),
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
void initMcpPool();
Logger.setSessionManagers(sessionManagers);
startDreamScheduler();

app.use('/api/providers', createProviderRouter());
app.use('/api/auth', createAuthRouter());
app.use('/api/config', createConfigRouter());
app.use('/api/skills', createSkillRouter());
app.use('/api/mcp', createMcpRouter());
app.use('/api/marketplace', createMarketplaceRouter(sessionManagers));
app.use('/api/tunnel', createTunnelRouter());
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

const httpServer = createHttpServer(app);

/**
 * 全局错误处理中间件 —— 兜底未 被 asyncHandler 捕获的异常（multer 文件校验、
 * 同步抛出等）。asyncHandler 自身已处理大部分路由异常，这里仅作为安全网。
 */
const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  if (err.name === 'MulterError') {
    res.status(400).json({ error: err.message });
    return;
  }
  Logger.log('HTTP', `${req.method} ${req.path} → unhandled error`, err);
  res.status(500).json({
    error: err instanceof Error ? err.message : 'Internal server error',
  });
};

app.use(errorHandler);

// Initialize WebSocket server
if (!isWebSocketInitialized()) {
  initWebSocket(httpServer);
}

export { httpServer };
