/**
 * @fileoverview Server startup entry point.
 */

import { Command } from 'commander';
import { initAllDirsAndFiles, Logger } from './util/index.js';
import { getLogsDir, getConfigPath } from './util/paths.js';
import { loadConfig } from './config/index.js';
import { startServer, httpServer } from './server/index.js';
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
