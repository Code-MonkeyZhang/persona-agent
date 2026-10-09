/**
 * @file main/host/local-host-provider.ts
 * @description 本机服务端的提供方式 - 收编找端口、拉起二进制、等待就绪、孤儿清理与优雅停止，产出本机那条连接
 */

import { execSync, spawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import { join } from 'path';
import net from 'net';
import { is } from '@electron-toolkit/utils';
import log from 'electron-log';

const isWin = process.platform === 'win32';
const BINARY_NAME = isWin ? 'persona-agent-server.exe' : 'persona-agent-server';
const CLOUDFLARED_NAME = isWin ? 'cloudflared.exe' : 'cloudflared';

/**
 * 本机服务端进程的全生命周期管理。
 * HostManager 通过它获得本机连接，进程常驻，不随连接切换停止。
 */
export class LocalHostProvider {
  /** 服务端子进程，未启动或已停止时为 null */
  private serverProcess: ChildProcess | null = null;
  /** 就绪后的服务端地址，waitForServer 通过前为 null */
  private serverAddress: string | null = null;

  /** 取本机服务端地址，未就绪时返回 null */
  getAddress(): string | null {
    return this.serverAddress;
  }

  /**
   * 启动本机服务端，已启动过时直接返回既有地址。
   * 先清理上次异常退出残留的孤儿进程，再找可用端口拉起二进制并等待就绪。
   * @returns 就绪后的服务端地址，启动失败时返回 null
   */
  async start(): Promise<string | null> {
    if (this.serverProcess || this.serverAddress) {
      return this.serverAddress;
    }

    killOrphanProcesses();

    let port: number;
    try {
      port = await findAvailablePort();
      log.info(`[local-host] Found available port: ${port}`);
    } catch (err: unknown) {
      log.error('[local-host] Failed to find available port:', err);
      return null;
    }

    const url = `http://localhost:${port}`;
    const binaryPath = getBinaryPath();
    log.info(
      `[local-host] Starting server from: ${binaryPath} on port ${port}`
    );
    log.info(`[local-host] Cloudflared path: ${getCloudflaredPath()}`);
    log.info(`[local-host] Templates path: ${getTemplatesPath()}`);

    this.serverProcess = spawn(binaryPath, [String(port)], {
      stdio: 'pipe',
      windowsHide: true,
      env: {
        ...process.env,
        PERSONA_CLOUDFLARED_BIN_PATH: getCloudflaredPath(),
        PERSONA_AGENT_TEMPLATE_DIR: getTemplatesPath(),
      },
    });

    this.serverProcess.on('error', (err) => {
      log.error('[local-host] Failed to start server:', err);
    });

    this.serverProcess.stdout?.on('data', (data) => {
      log.info(`[server] ${data.toString().trimEnd()}`);
    });
    this.serverProcess.stderr?.on('data', (data) => {
      log.error(`[server] ${data.toString().trimEnd()}`);
    });

    try {
      await waitForServer(url);
      this.serverAddress = url;
      log.info(`[local-host] Server ready at ${url}`);
      return url;
    } catch (err) {
      log.error('[local-host] Server failed to start:', err);
      return null;
    }
  }

  /**
   * 优雅停止服务端进程
   * - 发送 SIGTERM 请求优雅退出
   * - 等待 close 事件，超时 5 秒后 SIGKILL 强杀
   * - 用于安装更新前确保子进程完全退出
   */
  async stop(): Promise<void> {
    const proc = this.serverProcess;
    if (!proc) return;
    this.serverProcess = null;
    this.serverAddress = null;
    try {
      proc.kill();
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          try {
            proc.kill('SIGKILL');
          } catch {
            // 进程已退出
          }
          resolve();
        }, 5000);
        proc.once('close', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      log.info('[local-host] Server process stopped for update install');
    } catch {
      log.debug('[local-host] Server process already exited');
    }
  }

  /** 同步终止服务端进程，用于应用退出与 SIGINT、SIGTERM 信号 */
  kill(): void {
    if (!this.serverProcess) return;
    try {
      this.serverProcess.kill();
      log.info('[local-host] Server process killed on app quit');
    } catch {
      log.debug('[local-host] 服务器进程已退出');
    }
    this.serverProcess = null;
    this.serverAddress = null;
  }
}

/** 服务端二进制的所在位置，dev 指向 server 包构建产物，生产指向资源目录 */
function getBinaryPath(): string {
  if (is.dev) {
    return join(__dirname, '../../../server/dist', BINARY_NAME);
  }
  return join(process.resourcesPath, 'bin', BINARY_NAME);
}

/**
 * 返回 cloudflared 二进制路径。
 * dev 模式下位于 packages/server/bin，生产模式位于 resources/bin。
 * 通过环境变量传递给 server 进程。
 */
function getCloudflaredPath(): string {
  if (is.dev) {
    return join(__dirname, '../../../server/bin', CLOUDFLARED_NAME);
  }
  return join(process.resourcesPath, 'bin', CLOUDFLARED_NAME);
}

/**
 * 返回初始 Agent 播种模板目录。
 * dev 模式下位于仓库 packages/server/templates，生产模式位于 resources/templates。
 * 通过环境变量传递给 server 进程，播种语言由 server 端检测。
 */
function getTemplatesPath(): string {
  if (is.dev) {
    return join(__dirname, '../../../server/templates');
  }
  return join(process.resourcesPath, 'templates');
}

/**
 * 查找可用的网络端口
 * @returns {Promise<number>} 可用端口号
 * @throws {Error} 获取端口失败时抛出错误
 */
async function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err: NodeJS.ErrnoException) => {
      reject(err);
    });
    server.once('listening', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(() => {
        if (port) {
          resolve(port);
        } else {
          reject(new Error('Failed to get port'));
        }
      });
    });
    server.listen(0, '127.0.0.1');
  });
}

/**
 * 轮询 /health 端点等待后端服务启动就绪
 * @param url - 服务地址
 * @param maxAttempts - 最大重试次数
 * @throws 超时未就绪时抛出错误
 */
async function waitForServer(url: string, maxAttempts = 30): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // 服务尚未就绪
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Server failed to start within timeout');
}

/**
 * 清理上次桌面端异常退出后可能残留的服务器进程。
 * macOS/Linux 使用 killall，Windows 使用 taskkill。
 * 命令失败时静默忽略。
 */
function killOrphanProcesses(): void {
  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM persona-agent-server.exe', { stdio: 'ignore' });
    } else {
      execSync('killall persona-agent-server', { stdio: 'ignore' });
    }
  } catch {
    log.debug('[local-host] 未发现残留的服务器进程');
  }
}
