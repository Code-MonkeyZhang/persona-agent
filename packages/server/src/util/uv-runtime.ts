/**
 * @fileoverview uv 运行时管理 — 检测、一键下载（含 Python 解释器）、依赖预装。
 *
 * detectUv 检测 uv 是否可用（应用内安装或系统 PATH）。
 * installUv 下载 uv 二进制 + sha256 校验 + 解压 + uv python install。
 * syncDeps 在 MCP 目录跑 uv sync 预装依赖，避免首次连接超时。
 */

import { spawn, execSync, type ChildProcess } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { createHash } from 'node:crypto';
import { getRuntimesDir, getUvBinPath } from './paths.js';
import { Logger } from './logger.js';

const UV_RELEASE_URL =
  'https://github.com/astral-sh/uv/releases/latest/download/';

/** uv 安装 + Python 拉取的超时（秒） */
const INSTALL_TIMEOUT_MS = 180_000;
/** uv sync 依赖预装的超时（秒） */
const SYNC_TIMEOUT_MS = 300_000;

export interface UvStatus {
  ok: boolean;
  source: 'app' | 'system' | null;
  path: string | null;
  version?: string;
}

/** 当前平台对应的 uv 发布物文件名。 */
export function getUvAssetName(): string {
  const { platform, arch } = process;
  if (platform === 'darwin' && arch === 'arm64')
    return 'uv-aarch64-apple-darwin.tar.gz';
  if (platform === 'darwin' && arch === 'x64')
    return 'uv-x86_64-apple-darwin.tar.gz';
  if (platform === 'win32' && arch === 'x64')
    return 'uv-x86_64-pc-windows-msvc.zip';
  if (platform === 'linux' && arch === 'x64')
    return 'uv-x86_64-unknown-linux-gnu.tar.gz';
  if (platform === 'linux' && arch === 'arm64')
    return 'uv-aarch64-unknown-linux-gnu.tar.gz';
  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

// ---------------------------------------------------------------------------
// detectUv — 模块级缓存，照 git-bash-detector 模式
// ---------------------------------------------------------------------------

let cached: UvStatus | undefined;

/** 清除检测缓存，installUv 成功后调用。 */
export function invalidateUvCache(): void {
  cached = undefined;
}

/**
 * 检测 uv 是否可用。结果在进程生命周期内缓存。
 *
 * 优先查应用内 runtimes/uv，其次系统 PATH。
 *
 * @returns uv 状态（是否可用、来源、版本）
 */
export function detectUv(): UvStatus {
  if (cached !== undefined) return cached;
  cached = detect();
  return cached;
}

function detect(): UvStatus {
  const appPath = getUvBinPath();
  if (fs.existsSync(appPath)) {
    const version = tryGetVersion(appPath);
    if (version) {
      Logger.log('UV', `Detected uv (app) at ${appPath}, version ${version}`);
      return { ok: true, source: 'app', path: appPath, version };
    }
  }

  const systemVersion = tryGetVersion('uv');
  if (systemVersion) {
    Logger.log('UV', `Detected uv (system), version ${systemVersion}`);
    return { ok: true, source: 'system', path: null, version: systemVersion };
  }

  Logger.log('UV', 'uv not found');
  return { ok: false, source: null, path: null };
}

/** 跑 `<bin> --version`，返回版本号字符串；失败返回 null。 */
function tryGetVersion(bin: string): string | null {
  try {
    const output = execSync(`"${bin}" --version`, {
      encoding: 'utf8',
      timeout: 5000,
      windowsHide: true,
    }).trim();
    return output || null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// installUv — 下载 + 校验 + 解压 + python install
// ---------------------------------------------------------------------------

/**
 * 一键安装 uv 运行时。
 *
 * 下载 uv 二进制 + sha256 校验 + 解压 + uv python install。
 * 完成后调用方可直接用 detectUv() 确认。
 *
 * @throws 下载失败、校验不匹配、解压失败、python install 失败时抛出
 */
export async function installUv(): Promise<void> {
  Logger.log('UV', 'Starting uv installation');

  const runtimesDir = getRuntimesDir();
  fs.mkdirSync(runtimesDir, { recursive: true });

  const assetName = getUvAssetName();
  const isZip = assetName.endsWith('.zip');

  // 1. 下载压缩包
  const archivePath = path.join(runtimesDir, assetName);
  Logger.log('UV', `Downloading ${assetName}`);
  await downloadFile(UV_RELEASE_URL + assetName, archivePath);

  // 2. sha256 校验
  Logger.log('UV', 'Verifying sha256');
  const expectedHash = await fetchSha256(
    UV_RELEASE_URL + assetName + '.sha256'
  );
  const actualHash = hashFile(archivePath);
  if (actualHash !== expectedHash) {
    fs.rmSync(archivePath, { force: true });
    throw new Error(
      `uv sha256 mismatch: expected ${expectedHash}, got ${actualHash}`
    );
  }

  // 3. 解压
  Logger.log('UV', `Extracting ${isZip ? 'zip' : 'tar.gz'}`);
  extractArchive(archivePath, runtimesDir, isZip);
  fs.rmSync(archivePath, { force: true });

  // 4. 从子目录移出 uv 二进制（uv tarball/zip 解压出 uv-<platform>/ 子目录）
  moveUvOutOfSubdir(runtimesDir);

  // 5. 权限
  const uvPath = getUvBinPath();
  if (process.platform !== 'win32') {
    fs.chmodSync(uvPath, 0o755);
  }

  // 6. macOS 去 quarantine
  if (process.platform === 'darwin') {
    try {
      execSync(`xattr -d com.apple.quarantine "${uvPath}"`, {
        stdio: 'pipe',
        timeout: 5000,
      });
    } catch {
      // 没有 quarantine 属性时 xattr 会报错，忽略
    }
  }

  // 7. 拉取 Python 解释器
  Logger.log('UV', 'Installing Python interpreter');
  await runUvCommand(uvPath, ['python', 'install'], INSTALL_TIMEOUT_MS);
  Logger.log('UV', 'Python interpreter installed');

  invalidateUvCache();
  Logger.log('UV', 'uv installation complete');
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(dest, buffer);
}

async function fetchSha256(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download sha256: ${response.status}`);
  }
  const text = await response.text();
  // 格式: "<hash>  <filename>"
  return text.trim().split(/\s+/)[0];
}

function hashFile(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}

/**
 * 解压压缩包到目标目录。
 *
 * tar.gz 用系统 tar，zip（Windows）优先用 bsdtar（Win10+），失败回退 Expand-Archive。
 */
function extractArchive(
  archivePath: string,
  destDir: string,
  isZip: boolean
): void {
  if (!isZip) {
    execSync(`tar xzf "${archivePath}" -C "${destDir}"`, {
      stdio: 'pipe',
      timeout: 60_000,
    });
    return;
  }

  try {
    execSync(`tar -xf "${archivePath}" -C "${destDir}"`, {
      stdio: 'pipe',
      timeout: 60_000,
      windowsHide: true,
    });
  } catch {
    Logger.log('UV', 'bsdtar failed, falling back to Expand-Archive');
    execSync(
      `powershell -NoProfile -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`,
      { stdio: 'pipe', timeout: 60_000, windowsHide: true }
    );
  }
}

/**
 * uv 压缩包解压后会产生 uv-<platform>/ 子目录，把里面的 uv 二进制移到 runtimes 顶层。
 */
function moveUvOutOfSubdir(runtimesDir: string): void {
  const binName = process.platform === 'win32' ? 'uv.exe' : 'uv';
  const finalPath = path.join(runtimesDir, binName);

  if (fs.existsSync(finalPath)) return;

  for (const entry of fs.readdirSync(runtimesDir)) {
    const subdir = path.join(runtimesDir, entry);
    const stat = fs.statSync(subdir);
    if (!stat.isDirectory()) continue;
    const inner = path.join(subdir, binName);
    if (fs.existsSync(inner)) {
      fs.renameSync(inner, finalPath);
      fs.rmSync(subdir, { recursive: true });
      return;
    }
  }

  throw new Error(`uv binary not found after extraction in ${runtimesDir}`);
}

// ---------------------------------------------------------------------------
// syncDeps — 在 MCP 目录跑 uv sync
// ---------------------------------------------------------------------------

/**
 * 在指定 MCP 目录运行 uv sync 预装依赖。
 *
 * Python 解释器在 installUv 时已拉好，这里只建 venv + 装项目依赖。
 * 失败不删目录（uv 有缓存，方便重试）。
 *
 * @param mcpDir MCP 项目目录（含 pyproject.toml / uv.lock）
 * @throws uv sync 非零退出时抛出带 stderr 的错误
 */
export async function syncDeps(mcpDir: string): Promise<void> {
  const uvPath = getUvBinPath();
  Logger.log('UV', `Running uv sync in ${mcpDir}`);
  await runUvCommand(uvPath, ['sync'], SYNC_TIMEOUT_MS, mcpDir);
  Logger.log('UV', `uv sync completed for ${mcpDir}`);
}

// ---------------------------------------------------------------------------
// 通用 spawn 包装 — 照 tunnel-service.ts 模板
// ---------------------------------------------------------------------------

/**
 * spawn 一个 uv 子命令，收集 stderr，等待退出。
 *
 * @param uvPath uv 二进制路径
 * @param args 子命令参数
 * @param timeoutMs 超时毫秒
 * @param cwd 工作目录（可选）
 * @throws 非零退出、超时、spawn 失败时抛出
 */
function runUvCommand(
  uvPath: string,
  args: string[],
  timeoutMs: number,
  cwd?: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    let proc: ChildProcess;
    try {
      proc = spawn(uvPath, args, {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      reject(err);
      return;
    }

    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill();
      reject(
        new Error(`uv ${args.join(' ')} timed out after ${timeoutMs / 1000}s`)
      );
    }, timeoutMs);

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    proc.on('error', (err: Error) => {
      clearTimeout(timer);
      reject(err);
    });

    proc.on('exit', (code: number | null) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `uv ${args.join(' ')} exited with code ${code}` +
              (stderr ? `\n${stderr}` : '')
          )
        );
      }
    });
  });
}
