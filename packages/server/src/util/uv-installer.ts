/**
 * @fileoverview 工具运行环境安装器，三步装好 uv 和 Python。
 *
 * - 下载 uv 压缩包，核对记在程序里的校验值，解压到暂存文件夹
 * - 让刚解压的 uv 报出 Python 的下载地址，把文件下到暂存文件夹里 uv 认得的位置
 * - 让 uv 从暂存文件夹读文件安装 Python，这一步 uv 不发任何网络请求
 *
 * Python 装好以后 uv 才挪进正式位置。任何一步失败，正式位置都不动，暂存文件夹都删掉。
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { RuntimeInstallError, RuntimeInstallStep } from '@persona/shared';
import { FileDownloader, DownloadError } from './file-downloader.js';
import { Logger } from './logger.js';
import { getRuntimesDir, getUvBinPath } from './paths.js';
import {
  RUNTIME_PYTHON_VERSION,
  canFindPython,
  spawnAndCollect,
} from './uv-runtime.js';

/** 固定安装的 uv 版本，只跟着应用一起更新 */
export const UV_VERSION = '0.13.10';

/** 一个平台的 uv 发布物，file 是压缩包的文件名，sha256 是它的校验值 */
export interface UvRelease {
  file: string;
  sha256: string;
}

/** 六个平台的发布物，键是 process.platform 加 process.arch，校验值取自 uv 的发布页 */
export const UV_RELEASES: ReadonlyMap<string, UvRelease> = new Map([
  [
    'darwin-arm64',
    {
      file: 'uv-aarch64-apple-darwin.tar.gz',
      sha256:
        'e419bf07533bdbf48795fc793601c834dd79db57a8c49ce8e25cfe3a8639958d',
    },
  ],
  [
    'darwin-x64',
    {
      file: 'uv-x86_64-apple-darwin.tar.gz',
      sha256:
        '153e03197588204c04fc4c81cc4bafbfa4280222a385e4ee36a87aeec0ae63b4',
    },
  ],
  [
    'win32-x64',
    {
      file: 'uv-x86_64-pc-windows-msvc.zip',
      sha256:
        '297b3881fe1adfb922becc2c1613202abb41dc83ea5ff43d472aa087ca1f8683',
    },
  ],
  [
    'win32-arm64',
    {
      file: 'uv-aarch64-pc-windows-msvc.zip',
      sha256:
        'f223bcd3fa010174ffeeb885cc1d5334bb81388640c65baa5b8b42b47017337e',
    },
  ],
  [
    'linux-x64',
    {
      file: 'uv-x86_64-unknown-linux-gnu.tar.gz',
      sha256:
        'bf65ac1a0af10f92c522d91ac096c7c0a39657647b155577e7836c2cbbb4526c',
    },
  ],
  [
    'linux-arm64',
    {
      file: 'uv-aarch64-unknown-linux-gnu.tar.gz',
      sha256:
        '14590f644805a6234ffe071154340669e38137f38e60aa9629690119704107d2',
    },
  ],
]);

/** 整次安装的时间预算，两个下载共用，单位毫秒 */
const INSTALL_BUDGET_MS = 180_000;
/** 解压最多等多久，单位毫秒 */
const EXTRACT_TIMEOUT_MS = 60_000;
/** 一条 uv 命令最多等多久，单位毫秒 */
const UV_COMMAND_TIMEOUT_MS = 120_000;
/**
 * uv 的错误输出里出现这些字样，说明下载来的 Python 文件本身有问题。
 * 文件是合法的压缩包但内容变了时报校验值不匹配，根本不是压缩包时报解压失败。
 */
const BAD_ARCHIVE = /Hash mismatch|Failed to extract archive/;

/**
 * 环境安装失败，kind 是六个失败类别之一，界面上每个类别对应一句话。
 */
export class InstallError extends Error {
  constructor(
    message: string,
    readonly kind: RuntimeInstallError,
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = 'InstallError';
  }
}

/**
 * 回报安装进度的回调。
 * step 是当前步骤，received 是已经收到的字节数，total 在响应头到达前是 null。
 */
export type InstallProgress = (
  step: RuntimeInstallStep,
  received: number,
  total: number | null
) => void;

/**
 * 查一个平台和芯片组合对应的 uv 发布物，表里没有时返回 null。
 */
export function findUvRelease(
  platform: string,
  arch: string
): UvRelease | null {
  return UV_RELEASES.get(`${platform}-${arch}`) ?? null;
}

/**
 * 把安装过程中冒出来的错误统一成 InstallError。
 * 下载器给出的类别原样往上带，其余不是 InstallError 的错误都算本机出错。
 */
function toInstallError(err: unknown): InstallError {
  if (err instanceof InstallError) return err;
  if (err instanceof DownloadError) {
    return new InstallError(err.message, err.kind, { cause: err });
  }
  const message = err instanceof Error ? err.message : String(err);
  return new InstallError(message, 'local', { cause: err });
}

/**
 * 解压压缩包到目标目录。
 * tar.gz 用系统 tar；Windows zip 优先 bsdtar，失败回退 Expand-Archive。
 */
function extractArchive(archivePath: string, destDir: string): void {
  const tarOptions = {
    stdio: 'pipe' as const,
    timeout: EXTRACT_TIMEOUT_MS,
    windowsHide: true,
  };

  if (!archivePath.endsWith('.zip')) {
    execFileSync('tar', ['xzf', archivePath, '-C', destDir], tarOptions);
    return;
  }

  try {
    execFileSync('tar', ['-xf', archivePath, '-C', destDir], tarOptions);
  } catch {
    Logger.log('RUNTIME', 'bsdtar failed, falling back to Expand-Archive');
    // PowerShell 里路径两侧用单引号包住，路径自己带的单引号要写成两个
    const quote = (value: string): string => `'${value.replace(/'/g, "''")}'`;
    execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Expand-Archive -Path ${quote(archivePath)} -DestinationPath ${quote(destDir)} -Force`,
      ],
      tarOptions
    );
  }
}

/**
 * 算出 Python 压缩包在本机镜像里的路径。
 * 镜像照着下载地址的目录结构摆文件，地址倒数第二段是目录名，最后一段是文件名，文件名里的百分号编码要还原。
 */
function mirrorPath(mirrorDir: string, url: string): string {
  const segments = new URL(url).pathname.split('/');
  const file = decodeURIComponent(segments.pop() ?? '');
  const dir = segments.pop() ?? '';
  return path.join(mirrorDir, dir, file);
}

export class UvInstaller {
  /** 暂存文件夹，固定在 runtimes 下面，开始前清空，结束后不论成败都删掉 */
  private readonly stagingDir = path.join(getRuntimesDir(), '.staging');

  constructor(private readonly onProgress: InstallProgress) {}

  /**
   * 从上到下跑完三步。
   *
   * @throws InstallError 任何一步失败时抛出
   */
  async run(): Promise<void> {
    const deadline = Date.now() + INSTALL_BUDGET_MS;
    Logger.log('RUNTIME', `Install started, uv ${UV_VERSION}`, {
      platform: process.platform,
      arch: process.arch,
    });
    try {
      fs.rmSync(this.stagingDir, { recursive: true, force: true });
      fs.mkdirSync(this.stagingDir, { recursive: true });
      const stagedUv = await this.downloadUv(deadline);
      await this.installPython(stagedUv, deadline);
    } catch (err) {
      throw toInstallError(err);
    } finally {
      fs.rmSync(this.stagingDir, { recursive: true, force: true });
    }
    Logger.log('RUNTIME', 'Install finished');
  }

  /**
   * 第一步，把 uv 压缩包下到暂存文件夹，核对校验值后解压，返回解压出来的 uv 的路径。
   * 平台没有对应的发布物时不下载，直接按系统不支持失败。
   */
  private async downloadUv(deadline: number): Promise<string> {
    const release = findUvRelease(process.platform, process.arch);
    if (!release) {
      throw new InstallError(
        `No uv release for ${process.platform}-${process.arch}`,
        'unsupported'
      );
    }

    this.onProgress('uv', 0, null);
    const url = `https://github.com/astral-sh/uv/releases/download/${UV_VERSION}/${release.file}`;
    const archivePath = path.join(this.stagingDir, release.file);
    Logger.log('RUNTIME', `Downloading uv, ${url}`);
    await new FileDownloader().download(
      url,
      archivePath,
      (progress) => this.onProgress('uv', progress.received, progress.total),
      deadline
    );

    Logger.log('RUNTIME', 'Verifying uv archive', {
      archivePath,
      expected: release.sha256,
    });
    const actual = sha256File(archivePath);
    if (actual !== release.sha256) {
      throw new InstallError(
        `uv archive sha256 mismatch, expected ${release.sha256}, got ${actual}`,
        'corrupted'
      );
    }
    Logger.log('RUNTIME', 'uv archive sha256 verified');

    return this.extractUv(archivePath, release.file);
  }

  /**
   * 把 uv 的压缩包解压进暂存文件夹，返回解压出来的 uv 程序的路径。
   * 压缩包里是一个以文件名命名的文件夹，uv 和 uvx 两个程序都在里面，应用只用 uv。
   */
  private extractUv(archivePath: string, file: string): string {
    const extractDir = path.join(this.stagingDir, 'uv');
    fs.mkdirSync(extractDir, { recursive: true });
    try {
      extractArchive(archivePath, extractDir);
    } catch (err) {
      throw new InstallError(`Failed to extract ${archivePath}`, 'local', {
        cause: err,
      });
    }

    const binName = process.platform === 'win32' ? 'uv.exe' : 'uv';
    const uvPath = path.join(
      extractDir,
      file.replace(/\.(tar\.gz|zip)$/, ''),
      binName
    );
    if (!fs.existsSync(uvPath)) {
      throw new InstallError(
        `uv binary not found after extraction in ${extractDir}`,
        'local'
      );
    }

    // 设置可执行权限
    if (process.platform !== 'win32') {
      fs.chmodSync(uvPath, 0o755);
    }
    // macOS 去 quarantine
    if (process.platform === 'darwin') {
      try {
        execFileSync('xattr', ['-d', 'com.apple.quarantine', uvPath], {
          stdio: 'pipe',
          timeout: 5000,
        });
      } catch {
        // 没有 quarantine 属性时 xattr 会报错，忽略
      }
    }
    return uvPath;
  }

  /**
   * 第二步和第三步，下载 Python 压缩包，再让 uv 从暂存文件夹读文件把它装好。
   * 这一段 uv 不发任何网络请求，装完把 uv 挪进正式位置并验证一遍。
   */
  private async installPython(
    stagedUv: string,
    deadline: number
  ): Promise<void> {
    const entry = await this.resolvePythonDownload(stagedUv);

    this.onProgress('python', 0, null);
    const mirrorDir = path.join(this.stagingDir, 'python');
    const archivePath = mirrorPath(mirrorDir, entry.url);
    fs.mkdirSync(path.dirname(archivePath), { recursive: true });
    Logger.log('RUNTIME', `Downloading Python ${RUNTIME_PYTHON_VERSION}`, {
      url: entry.url,
    });
    await new FileDownloader().download(
      entry.url,
      archivePath,
      (progress) =>
        this.onProgress('python', progress.received, progress.total),
      deadline
    );

    this.onProgress('setup', 0, null);
    // 两个开关一个是不往 bin 文件夹放快捷方式，一个是不往 Windows 注册表登记
    const install = await this.runUv(stagedUv, [
      'python',
      'install',
      entry.key,
      '--mirror',
      pathToFileURL(mirrorDir).href,
      '--no-bin',
      '--no-registry',
      '--offline',
      '--no-config',
    ]);
    if (install.code !== 0) {
      const kind = BAD_ARCHIVE.test(install.stderr) ? 'corrupted' : 'local';
      throw new InstallError(
        `uv python install exited with code ${install.code}\n${install.stderr}`,
        kind
      );
    }

    const uvPath = this.placeUv(stagedUv);
    if (!(await canFindPython(uvPath))) {
      throw new InstallError(
        `uv cannot find Python ${RUNTIME_PYTHON_VERSION} after installation`,
        'local'
      );
    }
  }

  /**
   * 让刚解压的 uv 列出 Python 可下载的文件，取出它自己会下的那一个。
   * 清单编译在 uv 里，带上 offline 开关断网也能查，第一条带地址的 cpython 条目就是它。
   */
  private async resolvePythonDownload(
    uvPath: string
  ): Promise<{ key: string; url: string }> {
    const result = await this.runUv(uvPath, [
      'python',
      'list',
      RUNTIME_PYTHON_VERSION,
      '--output-format',
      'json',
      '--offline',
      '--no-config',
    ]);
    if (result.code !== 0) {
      throw new InstallError(
        `uv python list exited with code ${result.code}\n${result.stderr}`,
        'local'
      );
    }

    const list = JSON.parse(result.stdout) as Array<{
      key: string;
      url: string | null;
      implementation: string;
    }>;
    const entry = list.find(
      (item) => item.implementation === 'cpython' && item.url
    );
    if (!entry?.url) {
      throw new InstallError(
        `No downloadable cpython ${RUNTIME_PYTHON_VERSION} for ${process.platform}-${process.arch}`,
        'unsupported'
      );
    }
    Logger.log('RUNTIME', 'Python download resolved', {
      key: entry.key,
      url: entry.url,
    });
    return { key: entry.key, url: entry.url };
  }

  /**
   * 跑一条 uv 命令，退出码和错误输出都写进日志，由调用方按退出码归类。
   */
  private async runUv(uvPath: string, args: string[]) {
    Logger.log('RUNTIME', `Running uv ${args.join(' ')}`);
    let result;
    try {
      result = await spawnAndCollect(uvPath, args, {
        timeoutMs: UV_COMMAND_TIMEOUT_MS,
      });
    } catch (err) {
      throw new InstallError(`Failed to run uv ${args.join(' ')}`, 'local', {
        cause: err,
      });
    }
    Logger.log(
      'RUNTIME',
      `uv ${args.join(' ')} exited with code ${result.code}`,
      result.stderr.trim() || undefined
    );
    return result;
  }

  /**
   * Python 装好以后把暂存文件夹里的 uv 挪到正式位置，旧的 uv 先删掉再放新的。
   * 放在最后一步，前面任何一步失败，正式位置都不动。
   */
  private placeUv(stagedUv: string): string {
    const uvPath = getUvBinPath();
    fs.mkdirSync(path.dirname(uvPath), { recursive: true });
    fs.rmSync(uvPath, { force: true });
    fs.renameSync(stagedUv, uvPath);
    return uvPath;
  }
}

function sha256File(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return createHash('sha256').update(content).digest('hex');
}
