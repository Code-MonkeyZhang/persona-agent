/**
 * @fileoverview Server startup entry point.
 */

import { Command } from 'commander';
import type { Server } from 'node:http';
import { initAllDirsAndFiles, Logger } from './util/index.js';
import { errorMessage } from './util/errors.js';
import { getDb } from './db/index.js';
import { getLogsDir, getConfigPath } from './util/paths.js';
import { loadConfig } from './config.js';
import {
  backfillDefaultWorkspacePaths,
  seedInitialAgent,
} from './agent/index.js';
import { APP_NAME, APP_VERSION } from './util/app.js';

const program = new Command();
program
  .name(APP_NAME)
  .version(APP_VERSION)
  .argument('<port>', 'Port to listen on')
  .action(async (portStr: string) => {
    const port = parseInt(portStr, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port: ${portStr}`);
    }

    initAllDirsAndFiles();
    const config = loadConfig(getConfigPath());
    Logger.initialize(getLogsDir(), config.enableLogging);
    // 启动预热建库，正确性由惰性初始化兜底，早于它的写入会自动建库
    getDb();
    backfillDefaultWorkspacePaths();
    seedInitialAgent();

    // 动态 import 保证 seed 先于 http-server 模块体的 initSessionManagers()
    const { startServer, httpServer } = await import('./server/index.js');
    await startServer(port);
    setupExitHandlers(httpServer);
  });

program.parse();

/** 退出总预算，停隧道与整池收尾共享，超时无条件退出 */
const SHUTDOWN_BUDGET_MS = 5000;
/** 停隧道一步的分预算，防止隧道卡住吃光总预算 */
const TUNNEL_STOP_BUDGET_MS = 3000;

/**
 * 注册退出信号处理，SIGTERM 与 SIGINT 共用一条收尾链。
 *
 * 顺序是先停隧道，再整池收尾逐个告别子进程，最后关自己的网页服务。
 * 整体套五秒硬预算，任何一步卡住都按时退出，
 * 漏掉的部分由清账记录留给下次启动兜底。
 */
function setupExitHandlers(httpServer: Server): void {
  let exiting = false;

  const cleanup = (): void => {
    if (exiting) return;
    exiting = true;
    Logger.log('SERVER', 'Server shutting down');

    const deadline = setTimeout(() => {
      Logger.log('SERVER', 'Shutdown budget exhausted, exiting anyway');
      process.exit(0);
    }, SHUTDOWN_BUDGET_MS);
    deadline.unref?.();

    void (async () => {
      try {
        const { stopTunnel } =
          await import('./server/services/tunnel-service.js');
        await Promise.race([
          stopTunnel(),
          new Promise((resolve) => {
            const timer = setTimeout(resolve, TUNNEL_STOP_BUDGET_MS);
            timer.unref?.();
          }),
        ]);
      } catch (error: unknown) {
        Logger.log('SERVER', `Tunnel stop failed: ${errorMessage(error)}`);
      }

      try {
        const { shutdownMcpPool } = await import('./mcp/index.js');
        await shutdownMcpPool();
      } catch (error: unknown) {
        Logger.log('ERROR', `MCP pool shutdown failed: ${errorMessage(error)}`);
      }

      httpServer.close();
      Logger.log('SERVER', 'Shutdown complete');
      process.exit(0);
    })();
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}
