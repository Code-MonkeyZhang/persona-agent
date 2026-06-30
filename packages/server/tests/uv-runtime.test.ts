/**
 * @fileoverview uv-runtime 单元测试。
 * 只测不依赖网络和真实二进制的纯函数。
 * detectUv / installUv / syncDeps 依赖网络，留手动验证。
 */

import { describe, it, expect } from 'bun:test';
import { getUvAssetName } from '../src/util/uv-runtime.js';

describe('uv-runtime', () => {
  it('getUvAssetName returns correct asset for current platform', () => {
    const name = getUvAssetName();
    const { platform, arch } = process;

    if (platform === 'darwin' && arch === 'arm64') {
      expect(name).toBe('uv-aarch64-apple-darwin.tar.gz');
    } else if (platform === 'darwin' && arch === 'x64') {
      expect(name).toBe('uv-x86_64-apple-darwin.tar.gz');
    } else if (platform === 'win32' && arch === 'x64') {
      expect(name).toBe('uv-x86_64-pc-windows-msvc.zip');
    } else if (platform === 'linux' && arch === 'x64') {
      expect(name).toBe('uv-x86_64-unknown-linux-gnu.tar.gz');
    } else if (platform === 'linux' && arch === 'arm64') {
      expect(name).toBe('uv-aarch64-unknown-linux-gnu.tar.gz');
    }
  });

  it('getUvAssetName does not throw on supported platforms', () => {
    expect(() => getUvAssetName()).not.toThrow();
  });
});
