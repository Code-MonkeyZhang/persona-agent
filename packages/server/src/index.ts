/**
 * @fileoverview Server startup entry point.
 */

import { Command } from 'commander';
import type { Server } from 'node:http';
import { initAllDirsAndFiles, Logger } from './util/index.js';
import { getLogsDir, getConfigPath } from './util/paths.js';
import { loadConfig } from './config/index.js';
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
    backfillDefaultWorkspacePaths();
    seedInitialAgent();

    // 动态 import 保证 seed 先于 http-server 模块体的 initSessionManagers()
    const { startServer, httpServer } = await import('./server/index.js');
    await startServer(port);
    setupExitHandlers(httpServer);
  });

program.parse();

function setupExitHandlers(httpServer: Server): void {
  const cleanup = (): void => {
    Logger.log('SERVER', 'Server shutting down');
    void import('./server/tunnel-service.js')
      .then(({ stopTunnel }) => stopTunnel())
      .catch(() => {});
    httpServer.close();
    process.exit(0);
  };

  process.on('SIGTERM', cleanup);
  process.on('SIGINT', cleanup);
}
