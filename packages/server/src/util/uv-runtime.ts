/**
 * @fileoverview uv 运行时管理：检测、依赖预装。
 *
 * detectUv 检测 uv 是否可用，查应用内安装或系统 PATH，并且要求它找得到 Python。
 * 一键安装在 uv-installer 里，装完调用 invalidateUvCache 让下一次检测重新查。
 * syncDeps 在 MCP 目录跑 uv sync 预装依赖，避免首次连接超时。
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { UvStatus } from '@persona/shared';
import { getUvBinPath } from './paths.js';
import { Logger } from './logger.js';

/** uv sync 依赖预装的超时，单位毫秒 */
const SYNC_TIMEOUT_MS = 300_000;
/** 检测用的 uv 命令最多等多久，单位毫秒 */
const PROBE_TIMEOUT_MS = 5_000;
/**
 * 运行环境固定的 Python 版本，环境安装装的是它，就绪判定找的是它，uv sync 缺省也用它。
 *
 * 不固定版本时 uv 会拉最新稳定版，刚发布的解释器上大量 C 扩展包
 * 还没有预编译 wheel，会回退到源码编译，Windows 用户机器没有 MSVC
 * 直接失败。选发布满两年的版本保证 wheel 覆盖完整。
 */
export const RUNTIME_PYTHON_VERSION = '3.12';

// ---------------------------------------------------------------------------
// detectUv — 模块级缓存，照 git-bash-detector 模式
// ---------------------------------------------------------------------------

let cached: Promise<UvStatus> | undefined;

/** 清除检测缓存，环境安装成功后调用。 */
export function invalidateUvCache(): void {
  cached = undefined;
}

/**
 * 检测 uv 是否可用。结果在进程生命周期内缓存。
 *
 * 优先查应用内 runtimes/uv，其次系统 PATH。
 * 可用指 uv 在，并且它在不联网的情况下找得到 Python。
 *
 * @returns uv 状态：是否可用、来源、版本
 */
export async function detectUv(): Promise<UvStatus> {
  if (cached !== undefined) return cached;
  cached = detect();
  return cached;
}

async function detect(): Promise<UvStatus> {
  const appPath = getUvBinPath();
  const candidates: Array<{ source: 'app' | 'system'; bin: string }> = [
    { source: 'app', bin: appPath },
    { source: 'system', bin: 'uv' },
  ];

  for (const { source, bin } of candidates) {
    const version = await tryGetVersion(bin);
    if (!version) continue;
    Logger.log('UV', `Detected uv (${source}), version ${version}`, { bin });
    if (await canFindPython(bin)) {
      return {
        ok: true,
        source,
        path: source === 'app' ? appPath : null,
        version,
      };
    }
    Logger.log(
      'UV',
      `uv (${source}) cannot find Python ${RUNTIME_PYTHON_VERSION}`,
      {
        bin,
      }
    );
  }

  Logger.log('UV', 'No usable uv found');
  return { ok: false, source: null, path: null };
}

/**
 * 让指定的 uv 在不联网的情况下找一下 Python，找得到返回 true。
 * 就绪判定和安装器最后的验证都用它，两处对环境是否可用的判断才是同一把尺子。
 */
export async function canFindPython(bin: string): Promise<boolean> {
  try {
    const result = await spawnAndCollect(
      bin,
      [
        '--no-python-downloads',
        'python',
        'find',
        RUNTIME_PYTHON_VERSION,
        '--no-project',
      ],
      { timeoutMs: PROBE_TIMEOUT_MS }
    );
    return result.code === 0;
  } catch {
    return false;
  }
}

/**
 * 跑 `<bin> --version`，返回版本号字符串；失败返回 null。
 *
 * 用异步 spawn 避免 Bun 在 Windows 下 spawnSync/execFileSync
 * 偶发误报 ETIMEDOUT 的缺陷。
 */
async function tryGetVersion(bin: string): Promise<string | null> {
  try {
    const result = await spawnAndCollect(bin, ['--version'], {
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    return result.code === 0 ? result.stdout.trim() || null : null;
  } catch {
    return null;
  }
}

/**
 * 构造 uv sync 的参数。
 *
 * 目录里有 .python-version 时 uv 原生按它选解释器，尊重 MCP 作者自己的
 * 版本选择；没有时追加 --python 默认版本，防止 uv 挑到刚发布、生态还没
 * 提供 wheel 的解释器后回退源码编译。
 *
 * @param mcpDir MCP 项目目录
 * @returns uv sync 的完整参数
 */
export function buildSyncArgs(mcpDir: string): string[] {
  if (fs.existsSync(path.join(mcpDir, '.python-version'))) {
    return ['sync'];
  }
  return ['sync', '--python', RUNTIME_PYTHON_VERSION];
}

/**
 * 在指定 MCP 目录运行 uv sync 预装依赖。
 *
 * Python 解释器在环境安装时已经装好，这里只建 venv + 装项目依赖。
 * 失败不删目录，uv 有缓存方便重试。
 *
 * @param mcpDir MCP 项目目录，含 pyproject.toml / uv.lock
 * @throws uv sync 非零退出时抛出带 stderr 的错误
 */
export async function syncDeps(mcpDir: string): Promise<void> {
  const uvPath = getUvBinPath();
  const args = buildSyncArgs(mcpDir);
  Logger.log('UV', `Running uv ${args.join(' ')} in ${mcpDir}`);
  try {
    await runUvCommand(uvPath, args, SYNC_TIMEOUT_MS, mcpDir);
  } catch (err) {
    Logger.log(
      'UV',
      `uv sync failed for ${mcpDir}: ${err instanceof Error ? err.message : err}`
    );
    throw err;
  }
  Logger.log('UV', `uv sync completed for ${mcpDir}`);
}

// ---------------------------------------------------------------------------
// spawnAndCollect — 通用进程启动与输出收集
// ---------------------------------------------------------------------------

/**
 * spawn 一个进程，同时收集 stdout 和 stderr，等待退出。
 *
 * @param bin 可执行文件路径
 * @param args 参数数组
 * @param opts.timeoutMs 超时毫秒，超时后 kill 进程并 reject
 * @param opts.cwd 工作目录，可选
 * @returns 退出码、stdout、stderr
 * @throws spawn 失败或超时时抛出
 */
export function spawnAndCollect(
  bin: string,
  args: string[],
  opts: { timeoutMs: number; cwd?: string }
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    let proc: ChildProcess;
    try {
      proc = spawn(bin, args, {
        cwd: opts.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      reject(err);
      return;
    }

    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(
        new Error(
          `'${bin} ${args.join(' ')}' timed out after ${opts.timeoutMs / 1000}s`
        )
      );
    }, opts.timeoutMs);

    proc.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('exit', (code: number | null) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

/**
 * 跑一个 uv 子命令，非零退出时抛出带 stderr 的错误。
 */
async function runUvCommand(
  uvPath: string,
  args: string[],
  timeoutMs: number,
  cwd?: string
): Promise<void> {
  const result = await spawnAndCollect(uvPath, args, { timeoutMs, cwd });
  if (result.code !== 0) {
    throw new Error(
      `uv ${args.join(' ')} exited with code ${result.code}` +
        (result.stderr ? `\n${result.stderr}` : '')
    );
  }
}
