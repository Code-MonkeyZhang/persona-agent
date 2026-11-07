/**
 * @fileoverview 聊天内容校验测试：字符串与块数组形态、哈希与登记校验、附件上限。
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
  mock,
} from 'bun:test';
import * as fs from 'node:fs';
import { rmTempDir } from './temp-cleanup.js';
import * as path from 'node:path';
import * as os from 'node:os';

/** 临时测试目录 */
let tempDir: string;

/** Mock 路径模块，使用临时目录 */
mock.module('../src/util/paths.js', () => ({
  getAgentsDir: () => path.join(tempDir, 'agents'),
  getAgentDir: (id: string) => path.join(tempDir, 'agents', id),
  getAgentConfigPath: (id: string) =>
    path.join(tempDir, 'agents', id, 'config.json'),
  getAgentSystemPromptPath: (id: string) =>
    path.join(tempDir, 'agents', id, 'systemPrompt.md'),
  getAgentAssetsDir: (id: string) => path.join(tempDir, 'agents', id, 'assets'),
  getAgentAssetsPoseDir: (id: string) =>
    path.join(tempDir, 'agents', id, 'assets', 'pose'),
  getAgentAssetsBackgroundsDir: (id: string) =>
    path.join(tempDir, 'agents', id, 'assets', 'backgrounds'),
  getAgentMemoryDir: (id: string) => path.join(tempDir, 'agents', id, 'memory'),
  getWorkspaceDir: () => path.join(tempDir, 'workspace'),
  getAuthPath: () => path.join(tempDir, 'auth.json'),
  getDbPath: () => path.join(tempDir, 'persona.db'),
  getAttachmentsDir: () => path.join(tempDir, 'attachments'),
}));

import { validateChatContent } from '../src/server/routers/chat.js';
import { saveAttachment } from '../src/server/services/attachment-store.js';
import { getDb, closeDb } from '../src/db/index.js';
import { AppError } from '../src/util/errors.js';
import type { ContentBlock } from '@persona/shared';

/** 取校验抛出的错误信息，未抛时 fail */
function rejectMessage(content: unknown): string {
  try {
    validateChatContent(content);
  } catch (error) {
    return (error as AppError).message;
  }
  expect.unreachable('expected validateChatContent to throw');
  return '';
}

describe('Chat content validation', () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-content-test-'));
  });

  afterAll(() => {
    closeDb();
    rmTempDir(tempDir);
  });

  /** 每个测试前清空附件表与目录 */
  beforeEach(() => {
    getDb().run('DELETE FROM attachments');
    fs.rmSync(path.join(tempDir, 'attachments'), {
      recursive: true,
      force: true,
    });
  });

  /** 测试字符串形态原样放行 */
  it('should pass non-empty string through', () => {
    expect(validateChatContent('你好')).toBe('你好');
  });

  /** 测试空内容与非法形态拒绝 */
  it('should reject empty or malformed content', () => {
    for (const bad of ['', undefined, 42, [], {}]) {
      expect(rejectMessage(bad)).toBe('Content is required');
    }
  });

  /** 测试纯文本块数组放行 */
  it('should pass text-only block array', () => {
    const blocks: ContentBlock[] = [{ type: 'text', text: '看看这个' }];
    expect(validateChatContent(blocks)).toBe(blocks);
  });

  /** 测试未知块类型拒绝且原因带下标 */
  it('should reject unknown block type with index', () => {
    const message = rejectMessage([{ type: 'video', hash: 'a'.repeat(64) }]);
    expect(message).toContain('block 0');
    expect(message).toContain('unknown type');
  });

  /** 测试坏哈希拒绝且原因带下标 */
  it('should reject malformed hash with index', () => {
    const message = rejectMessage([
      { type: 'text', text: 'hi' },
      { type: 'file', hash: 'not-a-hash', name: 'a.zip', bytes: 1 },
    ]);
    expect(message).toContain('block 1');
    expect(message).toContain('invalid attachment hash');
  });

  /** 测试未登记哈希拒绝 */
  it('should reject unregistered hash', () => {
    const message = rejectMessage([
      {
        type: 'image',
        hash: 'b'.repeat(64),
        mimeType: 'image/png',
        width: 1,
        height: 1,
        bytes: 1,
      },
    ]);
    expect(message).toContain('block 0');
    expect(message).toContain('attachment not uploaded');
  });

  /** 测试登记为非图片的哈希不能当图片块使用 */
  it('should reject image block whose attachment is not an image', () => {
    const { hash } = saveAttachment(
      Buffer.from('zip'),
      'application/zip',
      'a.zip'
    );
    const message = rejectMessage([
      {
        type: 'image',
        hash,
        mimeType: 'image/png',
        width: 1,
        height: 1,
        bytes: 3,
      },
    ]);
    expect(message).toContain('block 0');
    expect(message).toContain('not an image');
  });

  /** 测试已登记的图片与文件块放行 */
  it('should pass registered image and file blocks', () => {
    const png = saveAttachment(Buffer.from('png'), 'image/png', 'a.png');
    const zip = saveAttachment(
      Buffer.from('zip'),
      'application/zip',
      'a.zip'
    );
    const blocks: ContentBlock[] = [
      { type: 'text', text: '这两份' },
      {
        type: 'image',
        hash: png.hash,
        mimeType: 'image/png',
        width: 10,
        height: 10,
        bytes: 3,
      },
      { type: 'file', hash: zip.hash, name: 'a.zip', bytes: 3 },
    ];
    expect(validateChatContent(blocks)).toBe(blocks);
  });

  /** 测试图片与文件合计超过二十个拒绝 */
  it('should reject more than twenty attachments', () => {
    const png = saveAttachment(Buffer.from('png'), 'image/png', 'a.png');
    const blocks: ContentBlock[] = Array.from({ length: 21 }, () => ({
      type: 'image' as const,
      hash: png.hash,
      mimeType: 'image/png',
      width: 10,
      height: 10,
      bytes: 3,
    }));
    const message = rejectMessage(blocks);
    expect(message).toContain('Too many attachments');
  });
});
