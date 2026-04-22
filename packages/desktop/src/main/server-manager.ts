/**
 * @file main/server-manager.ts
 * @description 后端服务进程管理 - 负责服务信息读写、进程存活检测、服务启动等待与终止
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import log from 'electron-log';

const CONFIG_DIR = path.join(os.homedir(), '.nano-agent', 'config');

export interface ServerInfo {
  port: number;
  pid: number;
  url: string;
}

/**
 * 获取 server.json 文件的绝对路径
 * @returns ~/.nano-agent/config/server.json 的完整路径
 */
export function getServerJsonPath(): string {
  return path.join(CONFIG_DIR, 'server.json');
}

/**
 * 从 server.json 读取服务信息
 * @returns 解析成功返回 ServerInfo，文件不存在或解析失败返回 null
 */
export function readServerInfo(): ServerInfo | null {
  const filePath = getServerJsonPath();
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(content) as ServerInfo;
  } catch {
    return null;
  }
}

/**
 * 检测指定进程是否仍在运行（通过发送信号 0 探测）
 * @param pid - 目标进程 ID
 * @returns 进程存活返回 true，否则返回 false
 */
export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * 删除残留的 server.json 文件，通常在服务进程已不存在时调用
 */
export function cleanupStaleServerInfo(): void {
  const filePath = getServerJsonPath();
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    log.info(`Cleaned up stale server.json`);
  }
}

/**
 * 查找当前是否有正在运行的后端服务
 * 读取 server.json 获取进程信息，验证进程是否存活，存活则复用
 * @returns 可用的服务 URL，无可用服务时返回 null
 */
export function findExistingServer(): string | null {
  const info = readServerInfo();
  if (!info) {
    log.info('No server.json found');
    return null;
  }

  log.info(`Found server.json: pid=${info.pid}, url=${info.url}`);

  if (isProcessAlive(info.pid)) {
    log.info(`Server process ${info.pid} is alive, reusing`);
    return info.url;
  }

  log.info(`Server process ${info.pid} is dead, cleaning up`);
  cleanupStaleServerInfo();
  return null;
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
 * 从 server.json 读取当前服务的 URL
 * @returns 服务 URL，无记录时返回 null
 */
export function getServerUrl(): string | null {
  const info = readServerInfo();
  return info?.url ?? null;
}

/**
 * 向后端服务进程发送 SIGTERM 信号终止运行，并清理 server.json
 * @returns 成功终止返回 true，无服务信息或终止失败返回 false
 */
export function killServer(): boolean {
  const info = readServerInfo();
  if (!info) return false;

  try {
    process.kill(info.pid, 'SIGTERM');
    cleanupStaleServerInfo();
    log.info(`Server process ${info.pid} killed`);
    return true;
  } catch {
    cleanupStaleServerInfo();
    return false;
  }
}
