/**
 * @fileoverview windowsPathCore 路径规整单元测试
 * 直接测试纯函数，不依赖运行平台。
 */

import { describe, it, expect } from 'bun:test';
import { windowsPathCore } from '../src/tools/file-tools.js';

describe('windowsPathCore', () => {
  it('should convert /cygdrive/c style paths', () => {
    expect(windowsPathCore('/cygdrive/c/Users/foo')).toBe('C:/Users/foo');
    expect(windowsPathCore('/cygdrive/d/')).toBe('D:/');
  });

  it('should convert /mnt/c style paths', () => {
    expect(windowsPathCore('/mnt/c/Users/foo')).toBe('C:/Users/foo');
    expect(windowsPathCore('/mnt/e/bar')).toBe('E:/bar');
  });

  it('should convert /c/ style paths', () => {
    expect(windowsPathCore('/c/Users/foo')).toBe('C:/Users/foo');
  });

  it('should convert /c:/ style paths', () => {
    expect(windowsPathCore('/c:/Users/foo')).toBe('C:/Users/foo');
  });

  it('should leave Windows-native paths unchanged', () => {
    expect(windowsPathCore('C:\\Users\\foo')).toBe('C:\\Users\\foo');
    expect(windowsPathCore('C:/Users/foo')).toBe('C:/Users/foo');
  });

  it('should leave relative paths unchanged', () => {
    expect(windowsPathCore('foo/bar')).toBe('foo/bar');
    expect(windowsPathCore('./test')).toBe('./test');
  });
});
