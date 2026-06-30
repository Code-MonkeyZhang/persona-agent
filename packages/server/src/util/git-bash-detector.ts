/**
 * @fileoverview Git Bash 检测器 — 在 Windows 上定位 bash.exe 路径。
 *
 * 非 win32 平台直接返回 /bin/bash。
 * win32 平台按优先级探测：环境变量 → where bash → where git 推导 → 硬编码路径。
 * 返回的路径统一使用正斜杠（bun 的 spawn 在 Windows 上不兼容反斜杠路径）。
 */

import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Logger } from './logger.js';

let cached: string | null | undefined;

/**
 * 检测 bash 可执行文件路径。结果在整个进程生命周期内缓存。
 *
 * @returns bash 路径字符串，或 null 表示未检测到
 */
export function findGitBash(): string | null {
  if (cached !== undefined) return cached;
  cached = detect();
  return cached;
}

function detect(): string | null {
  if (process.platform !== 'win32') {
    return '/bin/bash';
  }

  const found = viaEnvVar() ?? viaWhereBash() ?? viaGit() ?? viaHardcoded();

  if (found) {
    const normalized = found.replace(/\\/g, '/');
    Logger.log('SHELL', 'Git Bash detected', { path: normalized });
    return normalized;
  } else {
    Logger.log('SHELL', 'Git Bash not found');
    return null;
  }
}

/** 环境变量 PERSONA_GIT_BASH_PATH 用户手动覆盖入口。 */
function viaEnvVar(): string | null {
  const envPath = process.env['PERSONA_GIT_BASH_PATH'];
  if (envPath && fs.existsSync(envPath)) {
    return envPath;
  }
  return null;
}

/**
 * 用 where 命令查找可执行文件，返回第一个有效路径。
 * 过滤掉 System32 下的结果（那是 WSL 的 bash，不是 Git Bash）。
 */
function viaWhere(executable: string): string | null {
  let result: string;
  try {
    result = execSync(`where ${executable}`, {
      encoding: 'utf8',
      stdio: 'pipe',
      windowsHide: true,
    });
  } catch {
    return null;
  }

  for (const line of result
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)) {
    const lower = line.toLowerCase();
    if (lower.includes('system32')) continue;
    if (fs.existsSync(line)) return line;
  }
  return null;
}

/**
 * 通过 where bash 查找，优先返回 bin\bash.exe（redirector）而非 usr\bin\bash.exe。
 * bin\bash.exe 会自动设置 HOME/MSYSTEM/PATH 再启动真正的 bash。
 */
function viaWhereBash(): string | null {
  const found = viaWhere('bash');
  if (!found) return null;
  if (found.toLowerCase().includes('\\usr\\bin\\')) {
    const redirector = path.win32.join(
      found,
      '..',
      '..',
      '..',
      'bin',
      'bash.exe'
    );
    if (fs.existsSync(redirector)) return redirector;
  }
  return found;
}

/** 从 where git 的结果推导 bash.exe（git.exe 同目录的上两级 bin\bash.exe）。 */
function viaGit(): string | null {
  const gitPath = viaWhere('git');
  if (!gitPath) return null;

  const bashPath = path.win32.join(
    path.win32.dirname(gitPath),
    '..',
    '..',
    'bin',
    'bash.exe'
  );
  return fs.existsSync(bashPath) ? bashPath : null;
}

/** 硬编码的常见安装路径（覆盖默认安装、32 位安装、用户级安装）。 */
function viaHardcoded(): string | null {
  const localAppData = process.env['LOCALAPPDATA'];
  const candidates = [
    'C:\\Program Files\\Git\\bin\\bash.exe',
    'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    localAppData
      ? path.win32.join(localAppData, 'Programs', 'Git', 'bin', 'bash.exe')
      : null,
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) return candidate;
  }
  return null;
}
