/**
 * @fileoverview git-bash-detector 单元测试
 * 非 win32 平台直接可测；win32 探测分支留 Windows 手动验证。
 */

import { describe, it, expect } from 'bun:test';
import { findGitBash } from '../src/util/git-bash-detector.js';

describe('git-bash-detector', () => {
  it('should return /bin/bash on non-win32 platforms', () => {
    if (process.platform === 'win32') return;
    expect(findGitBash()).toBe('/bin/bash');
  });

  it('should cache the result across calls', () => {
    const first = findGitBash();
    const second = findGitBash();
    expect(second).toBe(first);
  });
});
