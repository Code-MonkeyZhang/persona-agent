/**
 * @fileoverview windowsPathCore 路径规整与 ReadTool 二进制嗅探单元测试
 * 直接测试纯函数与临时文件，不依赖运行平台。
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test';
import * as fs from 'node:fs';
import { rmTempDir } from './temp-cleanup.js';
import * as path from 'node:path';
import * as os from 'node:os';
import { windowsPathCore, ReadTool } from '../src/tools/file-tools.js';

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

describe('ReadTool binary sniffing', () => {
  /** 临时工作目录 */
  let workspace: string;
  /** 工具实例 */
  let tool: ReadTool;

  beforeAll(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'read-tool-test-'));
    tool = new ReadTool(workspace);
  });

  afterAll(() => rmTempDir(workspace));

  /** 测试文本文件正常读出带行号内容 */
  it('should read text file with line numbers', async () => {
    fs.writeFileSync(path.join(workspace, 'note.txt'), 'hello\nworld');
    const result = await tool.execute({ path: 'note.txt' });
    expect(result.success).toBe(true);
    expect(result.content).toContain('hello');
    expect(result.content).toContain('world');
  });

  /** 测试含零字节的文件被明确拒绝 */
  it('should reject file containing zero bytes', async () => {
    fs.writeFileSync(
      path.join(workspace, 'blob.bin'),
      Buffer.from([0x50, 0x4b, 0x00, 0x01])
    );
    const result = await tool.execute({ path: 'blob.bin' });
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'This file appears to be binary and cannot be read as text.'
    );
  });

  /** 测试非法 UTF-8 序列的文件被明确拒绝 */
  it('should reject file with invalid utf-8 sequences', async () => {
    fs.writeFileSync(
      path.join(workspace, 'bad-utf8.txt'),
      Buffer.from([0xff, 0xfe, 0xfd])
    );
    const result = await tool.execute({ path: 'bad-utf8.txt' });
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'This file appears to be binary and cannot be read as text.'
    );
  });

  /** 测试中文文本正常读取不受嗅探误伤 */
  it('should read utf-8 chinese text normally', async () => {
    fs.writeFileSync(path.join(workspace, '中文.txt'), '你好，世界');
    const result = await tool.execute({ path: '中文.txt' });
    expect(result.success).toBe(true);
    expect(result.content).toContain('你好，世界');
  });
});
