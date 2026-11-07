/**
 * @fileoverview pi-ai 转换层测试：图片块读盘编码、文件块句柄投影、缺失降级。
 */

import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import * as fs from 'node:fs';
import { rmTempDir } from './temp-cleanup.js';
import * as path from 'node:path';
import * as os from 'node:os';

/** 临时测试目录 */
let tempDir: string;
/** 图片附件的真实落盘路径 */
let imagePath: string;
/** 附件仓目录的假绝对路径，句柄投影引用它 */
const attachmentsDir = path.join(os.tmpdir(), 'converter-attachments');

/** getAttachment 的可变桩，测试逐例设置 */
let getAttachmentStub: (
  hash: string
) => { filePath: string; format: string } | null;

mock.module('../src/util/paths.js', () => ({
  getAttachmentsDir: () => attachmentsDir,
}));

mock.module('../src/server/services/attachment-store.js', () => ({
  getAttachment: (hash: string) => getAttachmentStub(hash),
}));

import { convertContext } from '../src/agent/pi-ai-converter.js';
import type { Message, ContentBlock } from '../src/schema/index.js';

/** 图片附件的真实字节 */
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** pi-ai 用户内容的宽松形状，断言用 */
interface PiAiContent {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

/** 转换一条 user 消息并取其内容数组 */
function convertUserContent(content: string | ContentBlock[]): PiAiContent[] {
  const ctx = convertContext(
    'system',
    [{ role: 'user', content } as Message],
    []
  );
  const first = ctx.messages[0] as { content: PiAiContent[] };
  return first.content;
}

describe('pi-ai converter', () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'converter-test-'));
    imagePath = path.join(tempDir, 'image.bin');
    fs.writeFileSync(imagePath, PNG_BYTES);
    getAttachmentStub = () => null;
  });

  afterAll(() => rmTempDir(tempDir));

  /** 测试纯字符串原样透传 */
  it('should pass plain string content through', () => {
    const ctx = convertContext(
      'system',
      [{ role: 'user', content: '你好' } as Message],
      []
    );
    const first = ctx.messages[0] as { content: string };
    expect(first.content).toBe('你好');
  });

  /** 测试文本块直映射 */
  it('should map text block to text content', () => {
    const [block] = convertUserContent([{ type: 'text', text: '看看' }]);
    expect(block).toEqual({ type: 'text', text: '看看' });
  });

  /** 测试图片块读盘转 base64 进 ImageContent */
  it('should encode registered image into base64 ImageContent', () => {
    const hash = 'a'.repeat(64);
    getAttachmentStub = (h) =>
      h === hash ? { filePath: imagePath, format: 'image/png' } : null;

    const [block] = convertUserContent([
      {
        type: 'image',
        hash,
        mimeType: 'image/png',
        width: 10,
        height: 10,
        bytes: 8,
      },
    ]);

    expect(block).toEqual({
      type: 'image',
      data: PNG_BYTES.toString('base64'),
      mimeType: 'image/png',
    });
    getAttachmentStub = () => null;
  });

  /** 测试图片未命中降级为占位文本 */
  it('should degrade missing image to placeholder text', () => {
    const [block] = convertUserContent([
      {
        type: 'image',
        hash: 'c'.repeat(64),
        mimeType: 'image/png',
        width: 1,
        height: 1,
        bytes: 1,
      },
    ]);
    expect(block.type).toBe('text');
    expect(block.text).toContain('Attachment unavailable');
  });

  /** 测试登记格式非图片的哈希同样降级 */
  it('should degrade non-image attachment to placeholder text', () => {
    const hash = 'd'.repeat(64);
    getAttachmentStub = (h) =>
      h === hash ? { filePath: imagePath, format: 'application/zip' } : null;

    const [block] = convertUserContent([
      {
        type: 'image',
        hash,
        mimeType: 'image/png',
        width: 1,
        height: 1,
        bytes: 1,
      },
    ]);
    expect(block.type).toBe('text');
    getAttachmentStub = () => null;
  });

  /** 测试文件块投影为含文件名与路径与读取引导的句柄 */
  it('should project file block into handle text', () => {
    const hash = 'e'.repeat(64);
    const [block] = convertUserContent([
      { type: 'file', hash, name: '报表.pdf', bytes: 245760 },
    ]);

    expect(block.type).toBe('text');
    expect(block.text).toContain('报表.pdf');
    expect(block.text).toContain('240.0KB');
    expect(block.text).toContain(`${attachmentsDir}/${hash}`);
    expect(block.text).toContain('read_file');
    expect(block.text).toContain('copy it to the workspace');
  });

  /** 测试混合块保序映射 */
  it('should map mixed blocks in order', () => {
    const hash = 'f'.repeat(64);
    const blocks = convertUserContent([
      { type: 'text', text: '开头' },
      { type: 'file', hash, name: 'a.zip', bytes: 10 },
      { type: 'text', text: '结尾' },
    ]);
    expect(blocks.map((b) => b.type)).toEqual(['text', 'text', 'text']);
    expect(blocks[0]?.text).toBe('开头');
    expect(blocks[2]?.text).toBe('结尾');
  });
});
