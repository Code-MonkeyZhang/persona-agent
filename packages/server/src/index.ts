/**
 * @fileoverview Server startup entry point.
 */

import { Command } from 'commander';
import { initAllDirsAndFiles, Logger } from './util/index.js';
import { getLogsDir, getConfigPath } from './util/paths.js';
import { loadConfig } from './config/index.js';
import { startServer, httpServer } from './server/index.js';

declare global {
  // 正式编译时通过 Bun --define 注入，开发模式回退为 "dev"
  var SERVER_VERSION: string | undefined;
}

const version = globalThis.SERVER_VERSION ?? 'dev';

const program = new Command();
program
  .name('persona-agent-server')
  .version(version)
  .argument('<port>', 'Port to listen on')
  .action(async (portStr: string) => {
    const port = parseInt(portStr, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error(`Invalid port: ${portStr}`);
    }

    initAllDirsAndFiles();
    const config = loadConfig(getConfigPath());
    Logger.initialize(getLogsDir(), config.enableLogging);

    await startServer(port);
    setupExitHandlers();
  });

program.parse();

function setupExitHandlers(): void {
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
