/**
 * @fileoverview Agent App 子进程编号的清账记录。
 *
 * server 拉起 stdio 子进程时把编号写进 mcp 目录下的记录文件，
 * 整池收尾成功后除名，没除掉的留给下次启动时回收。
 * 回收前先核对目标进程的命令行带有当时的 App 目录，
 * 编号被系统复用给无关进程时不会误伤。
 */
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Logger } from '../util/logger.js';
import { getMcpDir } from '../util/paths.js';
import type { McpServerConfig } from './types.js';

interface AppPidEntry {
  name: string;
  pid: number;
  dir: string;
}

/** 记录文件路径，与 mcp.json 同目录 */
export function getAppPidLedgerPath(): string {
  return path.join(getMcpDir(), 'app-pids.json');
}

/** 读出全部记录，文件缺失或内容损坏时返回空数组 */
export function readAppPidEntries(): AppPidEntry[] {
  try {
    const raw = JSON.parse(fs.readFileSync(getAppPidLedgerPath(), 'utf-8'));
    if (!Array.isArray(raw)) return [];
    return raw.filter(
      (e): e is AppPidEntry =>
        typeof e?.name === 'string' &&
        typeof e?.pid === 'number' &&
        typeof e?.dir === 'string'
    );
  } catch {
    return [];
  }
}

function writeAppPidEntries(entries: AppPidEntry[]): void {
  fs.mkdirSync(getMcpDir(), { recursive: true });
  fs.writeFileSync(getAppPidLedgerPath(), JSON.stringify(entries, null, 2));
}

/** 从配置解析 App 的运行目录，cwd 优先，其次 --directory 参数 */
function resolveAppDir(config: McpServerConfig): string {
  if (config.cwd) return config.cwd;
  const args = config.args ?? [];
  const index = args.indexOf('--directory');
  return index >= 0 ? (args[index + 1] ?? '') : '';
}

/**
 * 记录一个 App 子进程编号，同名覆盖。
 */
export function recordAppPid(
  name: string,
  pid: number,
  config: McpServerConfig
): void {
  const entries = readAppPidEntries().filter((e) => e.name !== name);
  entries.push({ name, pid, dir: resolveAppDir(config) });
  writeAppPidEntries(entries);
  Logger.log('MCP', `Recorded app pid ${pid} for '${name}'`);
}

/** 把一批名字从记录里除名，整池收尾与卸载时调用 */
export function removeAppPids(names: string[]): void {
  if (names.length === 0) return;
  const set = new Set(names);
  writeAppPidEntries(readAppPidEntries().filter((e) => !set.has(e.name)));
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 查目标进程的命令行，查询失败返回 null */
function commandLineOf(pid: number): Promise<string | null> {
  if (process.platform === 'win32') {
    return new Promise((resolve) => {
      execFile(
        'powershell',
        [
          '-NoProfile',
          '-Command',
          `(Get-CimInstance Win32_Process -Filter "ProcessId=${pid}").CommandLine`,
        ],
        (err, stdout) => resolve(err ? null : stdout.trim())
      );
    });
  }
  return new Promise((resolve) => {
    execFile('ps', ['-p', String(pid), '-o', 'command='], (err, stdout) =>
      resolve(err ? null : stdout.trim())
    );
  });
}

/**
 * 先 SIGTERM 给自行退出的机会，宽限一秒仍存活再 SIGKILL。
 * Windows 没有 SIGTERM 语义，改用 taskkill 强杀并带走整棵子进程树。
 */
function killPid(pid: number): void {
  if (process.platform === 'win32') {
    execFile('taskkill', ['/PID', String(pid), '/T', '/F'], () => {});
    return;
  }
  try {
    process.kill(pid, 'SIGTERM');
  } catch {
    return;
  }
  const timer = setTimeout(() => {
    if (isPidAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        // 进程已退出
      }
    }
  }, 1000);
  timer.unref?.();
}

/**
 * 回收上一场残留的 App 子进程。
 *
 * 进程不在了就只除名。
 * 进程还在且命令行对得上当时的 App 目录才动手，先礼后兵。
 * 身份对不上的只除名不杀，避免编号复用后误伤无关进程。
 */
export async function sweepStaleAppPids(): Promise<void> {
  const entries = readAppPidEntries();
  if (entries.length === 0) return;

  Logger.log('MCP', `Sweeping ${entries.length} stale app pid record(s)`);

  for (const entry of entries) {
    if (!isPidAlive(entry.pid)) {
      Logger.log('MCP', `Drop dead pid record of '${entry.name}'`);
      continue;
    }

    const command = await commandLineOf(entry.pid);
    if (entry.dir && command?.includes(entry.dir)) {
      Logger.log('MCP', `Reaping stale app '${entry.name}' pid ${entry.pid}`);
      killPid(entry.pid);
    } else {
      Logger.log(
        'MCP',
        `Skip pid ${entry.pid} of '${entry.name}', identity mismatch or dir unknown`
      );
    }
  }

  writeAppPidEntries([]);
}
