/**
 * @file main/server-manager.ts
 * @description 后端服务进程管理 - 负责服务启动等待、URL 管理和孤儿进程清理
 */

import { execSync } from 'child_process';
import log from 'electron-log';

let serverUrl: string | null = null;

/**
 * 设置当前 server 的 URL，供前端 IPC 查询
 */
export function setServerUrl(url: string | null): void {
  serverUrl = url;
}

/**
 * 获取当前 server 的 URL
 * @returns 服务 URL，未启动则返回 null
 */
export function getServerUrl(): string | null {
  return serverUrl;
}

/**
 * 轮询 /health 端点等待后端服务启动就绪
 * @param url - 服务地址
 * @param maxAttempts - 最大重试次数，默认 30（每次间隔 500ms，总计约 15s）
 * @throws 超时未就绪时抛出错误
 */
export async function waitForServer(
  url: string,
  maxAttempts = 30
): Promise<void> {
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(`${url}/health`);
      if (response.ok) {
        log.info(`Server is ready at ${url}`);
        return;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Server failed to start within timeout');
}

/**
 * 清理上次桌面端异常退出后可能残留的 server 进程。
 * 仅在 production 模式下执行，开发模式下跳过避免误杀。
 * macOS/Linux 使用 killall，Windows 使用 taskkill。
 * 命令失败时静默忽略（没有残留进程时命令会返回非零退出码）。
 */
export function killOrphanProcesses(): void {
  if (process.env.NODE_ENV === 'development') return;

  try {
    if (process.platform === 'win32') {
      execSync('taskkill /F /IM persona-agent-server.exe', { stdio: 'ignore' });
    } else {
      execSync('killall persona-agent-server', { stdio: 'ignore' });
    }
  } catch {
    // 没有残留进程，正常
  }
}
