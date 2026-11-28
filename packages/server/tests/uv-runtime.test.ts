/**
 * @fileoverview uv-runtime 单元测试。
 * 覆盖 uv 的版本表、就绪判定和不依赖网络的纯函数。
 * 整条安装链路依赖网络和真实二进制，留真机验收。
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { rmTempDir } from './temp-cleanup.js';
import { buildSyncArgs, canFindPython } from '../src/util/uv-runtime.js';
import { UV_RELEASES, findUvRelease } from '../src/util/uv-installer.js';

describe('uv release table', () => {
  /** Node 报出的芯片名和系统名，对应到 uv 发布物文件名里的写法 */
  const archOf: Record<string, string> = { arm64: 'aarch64', x64: 'x86_64' };
  const osOf: Record<string, string> = {
    darwin: 'apple-darwin',
    win32: 'pc-windows-msvc',
    linux: 'unknown-linux-gnu',
  };

  it('covers exactly the six supported platform and arch combinations', () => {
    expect([...UV_RELEASES.keys()].sort()).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
      'win32-arm64',
      'win32-x64',
    ]);
  });

  it('names each file after its platform and records a 64 digit hex sha256', () => {
    for (const key of UV_RELEASES.keys()) {
      const [os, arch] = key.split('-');
      const release = findUvRelease(os, arch);
      expect(release).not.toBeNull();
      expect(release?.file).toMatch(/^uv-.+\.(tar\.gz|zip)$/);
      expect(release?.file).toContain(`uv-${archOf[arch]}-${osOf[os]}.`);
      expect(release?.file.endsWith('.zip')).toBe(os === 'win32');
      expect(release?.sha256).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it('finds a release for the machine running the test', () => {
    const release = findUvRelease(process.platform, process.arch);
    expect(UV_RELEASES.get(`${process.platform}-${process.arch}`)).toBe(
      release
    );
  });

  it('returns null for a combination that is not in the table', () => {
    expect(findUvRelease('freebsd', 'x64')).toBeNull();
    expect(findUvRelease('linux', 'arm')).toBeNull();
  });
});

describe('canFindPython', () => {
  let dir: string;
  /** 假的 uv，只认就绪判定那一条命令，认出来按环境变量给的退出码退出 */
  const FAKE_UV = `#!/bin/sh
case "$*" in
  "--no-python-downloads python find 3.12 --no-project") exit "\${FAKE_UV_EXIT:-0}" ;;
  *) echo "unknown command: $*" >&2; exit 2 ;;
esac
`;
  const fakeUv = (): string => path.join(dir, 'uv');

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uv-runtime-'));
    fs.writeFileSync(fakeUv(), FAKE_UV, { mode: 0o755 });
  });

  afterAll(() => {
    delete process.env.FAKE_UV_EXIT;
    rmTempDir(dir);
  });

  it('is true when uv finds Python and exits with code 0', async () => {
    delete process.env.FAKE_UV_EXIT;
    expect(await canFindPython(fakeUv())).toBe(true);
  });

  it('is false when uv cannot find Python and exits with a non-zero code', async () => {
    process.env.FAKE_UV_EXIT = '2';
    expect(await canFindPython(fakeUv())).toBe(false);
  });

  it('is false when uv is too old to know the command', async () => {
    // 假 uv 对别的命令行一律报不认识并退出 2，顺带守住就绪判定发出的命令行
    fs.writeFileSync(
      fakeUv(),
      '#!/bin/sh\necho "error: unexpected argument" >&2\nexit 2\n',
      { mode: 0o755 }
    );
    expect(await canFindPython(fakeUv())).toBe(false);
  });

  it('is false when there is no uv at the given path', async () => {
    expect(await canFindPython(path.join(dir, 'no-such-uv'))).toBe(false);
  });
});

describe('buildSyncArgs', () => {
  /** 建一个临时目录，测试结束统一清理。 */
  const makeTempDir = (): string => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'uv-sync-args-'));
    return dir;
  };

  it('returns bare sync when .python-version exists in the MCP dir', () => {
    const dir = makeTempDir();
    try {
      fs.writeFileSync(path.join(dir, '.python-version'), '3.12\n');
      expect(buildSyncArgs(dir)).toEqual(['sync']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('appends the default python pin when .python-version is missing', () => {
    const dir = makeTempDir();
    try {
      expect(buildSyncArgs(dir)).toEqual(['sync', '--python', '3.12']);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
