/**
 * @fileoverview 聊天附件测试：哈希落盘登记、去重自愈、上传下载路由。
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
import express, { type Express } from 'express';
import { createServer, type Server } from 'http';
import * as net from 'node:net';
import * as fs from 'node:fs';
import { rmTempDir } from './temp-cleanup.js';
import * as path from 'node:path';
import * as os from 'node:os';
import { createHash } from 'node:crypto';

/** 临时测试目录 */
let tempDir: string;

mock.module('../src/util/paths.js', () => ({
  getDbPath: () => path.join(tempDir, 'persona.db'),
  getAttachmentsDir: () => path.join(tempDir, 'attachments'),
}));

import { createAttachmentRouter } from '../src/server/routers/attachment.js';
import {
  saveAttachment,
  getAttachment,
} from '../src/server/services/attachment-store.js';
import { getDb, closeDb } from '../src/db/index.js';

/** 查找可用端口，避免端口冲突 */
function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '0.0.0.0', () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

/** 上传接口的响应体 */
interface UploadResponse {
  success?: boolean;
  hash?: string;
  format?: string;
  size?: number;
  error?: string;
}

/** 发一次 multipart 上传并解析响应，非 JSON 错误体宽容返回空对象 */
async function upload(
  content: Buffer,
  type: string
): Promise<{ status: number; data: UploadResponse }> {
  const form = new FormData();
  form.append('file', new Blob([content], { type }), 'attachment.bin');
  const res = await fetch(`http://localhost:${PORT}/api/attachments`, {
    method: 'POST',
    body: form,
  });
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) as UploadResponse };
  } catch {
    return { status: res.status, data: {} };
  }
}

/** Express 应用实例 */
let app: Express;
/** HTTP 服务器实例 */
let httpServer: Server;
/** 测试服务器端口 */
let PORT: number;

describe('Attachment Tests', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attachment-test-'));

    app = express();
    app.use('/api/attachments', createAttachmentRouter());

    PORT = await findAvailablePort();
    httpServer = createServer(app);
    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, '0.0.0.0', () => resolve());
    });
  });

  afterAll(async () => {
    httpServer.closeAllConnections?.();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
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

  /** 存储模块行为 */
  describe('attachment-store', () => {
    /** 测试保存登记表行并返回内容哈希 */
    it('should register row and return content hash on save', () => {
      const content = Buffer.from('hello-attachment');
      const meta = saveAttachment(content, 'image/png');

      expect(meta.hash).toBe(
        createHash('sha256').update(content).digest('hex')
      );
      expect(meta.format).toBe('image/png');
      expect(meta.size).toBe(content.length);

      const row = getDb()
        .query<{ hash: string; format: string; size: number }>(
          'SELECT hash, format, size FROM attachments'
        )
        .get();
      expect(row).toEqual({
        hash: meta.hash,
        format: 'image/png',
        size: content.length,
      });
    });

    /** 测试同内容去重为单文件单表行 */
    it('should deduplicate identical content into one file and one row', () => {
      const content = Buffer.from('duplicate-me');
      const first = saveAttachment(content, 'image/png');
      const second = saveAttachment(content, 'image/png');

      expect(second.hash).toBe(first.hash);
      expect(
        fs.readdirSync(path.join(tempDir, 'attachments'))
      ).toEqual([first.hash]);
      const row = getDb()
        .query<{ n: number }>('SELECT COUNT(*) AS n FROM attachments')
        .get();
      expect(row?.n).toBe(1);
    });

    /** 测试未知哈希返回 null */
    it('should return null for unknown hash', () => {
      expect(getAttachment('a'.repeat(64))).toBeNull();
    });

    /** 测试文件缺失返回 null 且重存自愈 */
    it('should self-heal when the file is missing', () => {
      const content = Buffer.from('heal-me');
      const meta = saveAttachment(content, 'image/png');
      fs.rmSync(path.join(tempDir, 'attachments', meta.hash));

      expect(getAttachment(meta.hash)).toBeNull();

      saveAttachment(content, 'image/png');
      expect(getAttachment(meta.hash)).not.toBeNull();
    });
  });

  /** HTTP 路由行为 */
  describe('HTTP API', () => {
    /** 测试上传返回哈希与元信息 */
    it('should upload and return hash with meta', async () => {
      const content = Buffer.from('fake-png-bytes');
      const { status, data } = await upload(content, 'image/png');

      expect(status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.hash).toBe(
        createHash('sha256').update(content).digest('hex')
      );
      expect(data.format).toBe('image/png');
      expect(data.size).toBe(content.length);
    });

    /** 测试下载字节一致且缓存响应头在场 */
    it('should download identical bytes with immutable header', async () => {
      const content = Buffer.from('download-me-内容');
      const { data } = await upload(content, 'image/png');

      const res = await fetch(
        `http://localhost:${PORT}/api/attachments/${data.hash}`
      );
      expect(res.status).toBe(200);
      expect(Buffer.from(await res.arrayBuffer())).toEqual(content);
      expect(res.headers.get('content-type')).toBe('image/png');
      expect(res.headers.get('cache-control')).toBe(
        'public, max-age=31536000, immutable'
      );
    });

    /** 测试重复上传命中去重 */
    it('should deduplicate repeated uploads', async () => {
      const content = Buffer.from('http-dedup');
      const first = await upload(content, 'audio/mpeg');
      const second = await upload(content, 'audio/mpeg');

      expect(second.data.hash).toBe(first.data.hash);
      expect(
        fs.readdirSync(path.join(tempDir, 'attachments'))
      ).toEqual([first.data.hash]);
      const row = getDb()
        .query<{ n: number }>('SELECT COUNT(*) AS n FROM attachments')
        .get();
      expect(row?.n).toBe(1);
    });

    /** 测试未知与非法哈希 404 */
    it('should return 404 for unknown or malformed hash', async () => {
      const unknown = await fetch(
        `http://localhost:${PORT}/api/attachments/${'b'.repeat(64)}`
      );
      expect(unknown.status).toBe(404);

      const malformed = await fetch(
        `http://localhost:${PORT}/api/attachments/not-a-hash`
      );
      expect(malformed.status).toBe(404);
    });

    /** 测试非白名单类型 400 */
    it('should return 400 for unsupported mime', async () => {
      const { status } = await upload(Buffer.from('plain'), 'text/plain');
      expect(status).toBe(400);
    });

    /** 测试缺文件 400 */
    it('should return 400 when no file uploaded', async () => {
      const form = new FormData();
      form.append('other', 'value');
      const res = await fetch(`http://localhost:${PORT}/api/attachments`, {
        method: 'POST',
        body: form,
      });
      expect(res.status).toBe(400);
    });
  });
});
