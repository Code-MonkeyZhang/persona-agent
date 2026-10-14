/**
 * @fileoverview 小手机偏好测试：排列校验、壁纸上传删除、快照与变更流搭车。
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
import { Jimp } from 'jimp';
import type { LauncherPrefEntry, WallpaperDoc } from '@persona/shared';
import type { SessionChange } from '@persona/shared';
import { AppError } from '../src/util/errors.js';

/** 临时测试目录 */
let tempDir: string;
/** Agent 配置存储目录 */
let agentsDir: string;

// 把路径模块整体指向临时目录，快照构建的 agent 图与壁纸目录都进沙箱
mock.module('../src/util/paths.js', () => ({
  getAgentsDir: () => agentsDir,
  getAgentDir: (id: string) => path.join(agentsDir, id),
  getAgentConfigPath: (id: string) => path.join(agentsDir, id, 'config.json'),
  getAgentSystemPromptPath: (id: string) =>
    path.join(agentsDir, id, 'systemPrompt.md'),
  getAgentAssetsDir: (id: string) => path.join(agentsDir, id, 'assets'),
  getAgentAssetsPoseDir: (id: string) =>
    path.join(agentsDir, id, 'assets', 'pose'),
  getAgentAssetsBackgroundsDir: (id: string) =>
    path.join(agentsDir, id, 'assets', 'backgrounds'),
  getAgentMemoryDir: (id: string) => path.join(agentsDir, id, 'memory'),
  getWorkspaceDir: () => path.join(tempDir, 'workspace'),
  getDbPath: () => path.join(tempDir, 'persona.db'),
  getWallpapersDir: () => path.join(tempDir, 'wallpapers'),
}));

import { createLauncherRouter } from '../src/server/routers/launcher.js';
import { addWallpaperImage } from '../src/server/services/launcher-store.js';
import { buildSnapshot } from '../src/sync/sync-service.js';
import { sessionChangeEmitter } from '../src/session/changes.js';
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

/** 用 jimp 合成一张纯色 JPEG 测试图 */
async function makeJpeg(
  width: number,
  height: number,
  color: number
): Promise<Buffer> {
  const image = new Jimp({ width, height, color });
  return image.getBuffer('image/jpeg');
}

/** 浅色主图，采样应判为亮 */
let lightImage: Buffer;
/** 深色主图，采样应判为暗 */
let darkImage: Buffer;
/** 合格缩略图 */
let thumbImage: Buffer;

/** Express 应用实例 */
let app: Express;
/** HTTP 服务器实例 */
let httpServer: Server;
/** 测试服务器端口 */
let PORT: number;

/** 发 JSON PUT 并解析响应 */
async function putJson(
  urlPath: string,
  body: unknown
): Promise<{ status: number; data: Record<string, unknown> }> {
  const res = await fetch(`http://localhost:${PORT}${urlPath}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: (await res.json()) as Record<string, unknown> };
}

/** 发一次壁纸 multipart 上传并解析响应 */
async function uploadWallpaper(
  image: Buffer,
  thumb: Buffer,
  name?: string
): Promise<{ status: number; data: Record<string, unknown> }> {
  const form = new FormData();
  form.append('image', new Blob([image], { type: 'image/jpeg' }), 'wp.jpg');
  form.append('thumb', new Blob([thumb], { type: 'image/jpeg' }), 'wp-t.jpg');
  if (name) form.append('name', name);
  const res = await fetch(
    `http://localhost:${PORT}/api/launcher/wallpaper/image`,
    { method: 'POST', body: form }
  );
  return { status: res.status, data: (await res.json()) as Record<string, unknown> };
}

/** 从上传响应里取壁纸文档 */
function docOf(data: Record<string, unknown>): WallpaperDoc {
  return (data['payload'] as WallpaperDoc) ?? { currentId: null, customs: [] };
}

describe('Launcher Prefs', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'launcher-test-'));
    agentsDir = path.join(tempDir, 'agents');

    lightImage = await makeJpeg(720, 1280, 0xf0f0f0ff);
    darkImage = await makeJpeg(720, 1280, 0x202020ff);
    thumbImage = await makeJpeg(240, 426, 0xf0f0f0ff);

    app = express();
    app.use(express.json());
    app.use('/api/launcher', createLauncherRouter());

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

  /** 每个测试前清空偏好表、变更表与壁纸目录 */
  beforeEach(() => {
    getDb().run('DELETE FROM launcher_prefs');
    getDb().run('DELETE FROM changes');
    fs.rmSync(path.join(tempDir, 'wallpapers'), {
      recursive: true,
      force: true,
    });
  });

  describe('order api', () => {
    /** 测试合法排列落库并返回信封 */
    it('should accept valid order with app and slot ids', async () => {
      const { status, data } = await putJson('/api/launcher/order', {
        appOrder: [null, 'my-app', 'slot:settings'],
      });
      expect(status).toBe(200);
      const entry = data as unknown as LauncherPrefEntry<{
        appOrder: (string | null)[];
      }>;
      expect(entry.payload.appOrder).toEqual([null, 'my-app', 'slot:settings']);
      expect(typeof entry.updatedAt).toBe('number');
    });

    /** 测试非法 id 与非法形状拒绝 */
    it('should reject invalid order ids', async () => {
      const bad1 = await putJson('/api/launcher/order', {
        appOrder: ['Bad_ID'],
      });
      expect(bad1.status).toBe(400);

      const bad2 = await putJson('/api/launcher/order', {
        appOrder: ['slot:Settings'],
      });
      expect(bad2.status).toBe(400);

      const bad3 = await putJson('/api/launcher/order', { appOrder: 'x' });
      expect(bad3.status).toBe(400);
    });
  });

  describe('wallpaper api', () => {
    /** 测试改当前选择只动 currentId */
    it('should accept currentId switch', async () => {
      const set = await putJson('/api/launcher/wallpaper', {
        currentId: 'dawn',
      });
      expect(set.status).toBe(200);
      expect(docOf(set.data).currentId).toBe('dawn');

      const reset = await putJson('/api/launcher/wallpaper', {
        currentId: null,
      });
      expect(reset.status).toBe(200);
      expect(docOf(reset.data).currentId).toBeNull();
    });

    /** 测试非法 currentId 类型拒绝 */
    it('should reject non-string currentId', async () => {
      const { status } = await putJson('/api/launcher/wallpaper', {
        currentId: 123,
      });
      expect(status).toBe(400);
    });
  });

  describe('wallpaper upload', () => {
    /** 测试合格上传落条目落文件并带深浅采样 */
    it('should upload, sample dark flag and store files', async () => {
      const { status, data } = await uploadWallpaper(
        lightImage,
        thumbImage,
        '海边'
      );
      expect(status).toBe(200);
      const doc = docOf(data);
      expect(doc.customs).toHaveLength(1);
      const custom = doc.customs[0]!;
      expect(custom.id).toMatch(/^custom-/);
      expect(custom.name).toBe('海边');
      expect(custom.dark).toBe(false);
      expect(custom.hash).toBe(
        createHash('sha256').update(lightImage).digest('hex')
      );
      const dir = path.join(tempDir, 'wallpapers');
      expect(fs.existsSync(path.join(dir, custom.hash))).toBe(true);
      expect(fs.existsSync(path.join(dir, custom.thumbHash))).toBe(true);
    });

    /** 测试深色主图采样为暗 */
    it('should sample dark image as dark', async () => {
      const { status, data } = await uploadWallpaper(darkImage, thumbImage);
      expect(status).toBe(200);
      expect(docOf(data).customs[0]?.dark).toBe(true);
    });

    /** 测试短边不足拒绝 */
    it('should reject short side below minimum', async () => {
      const small = await makeJpeg(719, 1280, 0xf0f0f0ff);
      const { status } = await uploadWallpaper(small, thumbImage);
      expect(status).toBe(400);
    });

    /** 测试非白名单类型拒绝 */
    it('should reject unsupported mime', async () => {
      const form = new FormData();
      form.append(
        'image',
        new Blob([Buffer.from('plain')], { type: 'text/plain' }),
        'wp.txt'
      );
      form.append(
        'thumb',
        new Blob([thumbImage], { type: 'image/jpeg' }),
        'wp-t.jpg'
      );
      const res = await fetch(
        `http://localhost:${PORT}/api/launcher/wallpaper/image`,
        { method: 'POST', body: form }
      );
      expect(res.status).toBe(400);
    });

    /** 测试缺缩略图拒绝 */
    it('should reject missing thumb', async () => {
      const form = new FormData();
      form.append(
        'image',
        new Blob([lightImage], { type: 'image/jpeg' }),
        'wp.jpg'
      );
      const res = await fetch(
        `http://localhost:${PORT}/api/launcher/wallpaper/image`,
        { method: 'POST', body: form }
      );
      expect(res.status).toBe(400);
    });

    /** 测试不可解码内容拒绝 */
    it('should reject undecodable image bytes', async () => {
      const { status } = await uploadWallpaper(
        Buffer.from('not-an-image'),
        thumbImage
      );
      expect(status).toBe(400);
    });

    /** 测试超 2MB 主图拒绝 */
    it('should reject oversize image', async () => {
      const big = Buffer.alloc(2 * 1024 * 1024 + 1);
      let statusCode = 0;
      try {
        await addWallpaperImage(big, thumbImage);
      } catch (err) {
        statusCode = (err as AppError).statusCode;
      }
      expect(statusCode).toBe(400);
    });

    /** 测试数量上限拒绝 */
    it('should reject uploads beyond the limit', async () => {
      for (let i = 0; i < 20; i++) {
        const res = await uploadWallpaper(lightImage, thumbImage);
        expect(res.status).toBe(200);
      }
      const extra = await uploadWallpaper(lightImage, thumbImage);
      expect(extra.status).toBe(400);
    });
  });

  describe('wallpaper delete', () => {
    /** 测试删除清条目清文件并在当前壁纸被删时归位默认 */
    it('should remove entry, files and reset currentId', async () => {
      const up = await uploadWallpaper(lightImage, thumbImage);
      const custom = docOf(up.data).customs[0]!;
      await putJson('/api/launcher/wallpaper', { currentId: custom.id });

      const res = await fetch(
        `http://localhost:${PORT}/api/launcher/wallpaper/image/${custom.id}`,
        { method: 'DELETE' }
      );
      expect(res.status).toBe(200);
      const doc = docOf((await res.json()) as Record<string, unknown>);
      expect(doc.customs).toHaveLength(0);
      expect(doc.currentId).toBeNull();
      expect(fs.readdirSync(path.join(tempDir, 'wallpapers'))).toEqual([]);
    });

    /** 测试删除未知条目 404 */
    it('should return 404 for unknown id', async () => {
      const res = await fetch(
        `http://localhost:${PORT}/api/launcher/wallpaper/image/custom-none`,
        { method: 'DELETE' }
      );
      expect(res.status).toBe(404);
    });
  });

  describe('wallpaper file download', () => {
    /** 测试哈希下载字节一致且带 immutable 缓存头 */
    it('should download identical bytes with immutable header', async () => {
      const up = await uploadWallpaper(lightImage, thumbImage);
      const custom = docOf(up.data).customs[0]!;

      const res = await fetch(
        `http://localhost:${PORT}/api/launcher/wallpaper/file/${custom.hash}`
      );
      expect(res.status).toBe(200);
      expect(Buffer.from(await res.arrayBuffer())).toEqual(lightImage);
      expect(res.headers.get('content-type')).toBe('image/jpeg');
      expect(res.headers.get('cache-control')).toBe(
        'public, max-age=31536000, immutable'
      );
    });

    /** 测试非法与未知哈希 404 */
    it('should return 404 for malformed or unknown hash', async () => {
      const malformed = await fetch(
        `http://localhost:${PORT}/api/launcher/wallpaper/file/not-a-hash`
      );
      expect(malformed.status).toBe(404);

      const unknown = await fetch(
        `http://localhost:${PORT}/api/launcher/wallpaper/file/${'a'.repeat(64)}`
      );
      expect(unknown.status).toBe(404);
    });
  });

  describe('change stream', () => {
    /** 测试写入即广播 launcher_prefs_updated 且载荷携带整份文档 */
    it('should emit launcher_prefs_updated on save', async () => {
      const received = new Promise<SessionChange>((resolve) => {
        sessionChangeEmitter.once('change', resolve);
      });
      const { data } = await putJson('/api/launcher/order', {
        appOrder: ['emit-app'],
      });
      const event = await received;
      expect(event.kind).toBe('launcher_prefs_updated');
      expect(event.sessionId).toBeNull();
      expect(event.data).toEqual({
        key: 'appOrder',
        payload: { appOrder: ['emit-app'] },
        updatedAt: (data as { updatedAt: number })['updatedAt'],
      });
    });

    /** 测试多次写入变更流按序号递增 */
    it('should record ordered change rows', async () => {
      await putJson('/api/launcher/order', { appOrder: ['a'] });
      await putJson('/api/launcher/order', { appOrder: ['b'] });

      const rows = getDb()
        .query<{ seq: number }>(
          "SELECT seq FROM changes WHERE kind = 'launcher_prefs_updated' ORDER BY seq"
        )
        .all();
      expect(rows).toHaveLength(2);
      expect(rows[1]!.seq).toBeGreaterThan(rows[0]!.seq);
    });
  });

  describe('snapshot', () => {
    /** 测试快照携带 launcher 节且与接口写入一致 */
    it('should include launcher section in snapshot', async () => {
      await putJson('/api/launcher/order', {
        appOrder: ['snap-app', null, 'snap-app-2'],
      });
      await uploadWallpaper(lightImage, thumbImage, '快照壁纸');

      const snapshot = buildSnapshot();
      expect(snapshot.launcher?.appOrder?.payload.appOrder).toEqual([
        'snap-app',
        null,
        'snap-app-2',
      ]);
      expect(snapshot.launcher?.wallpaper?.payload.customs).toHaveLength(1);
      expect(
        (snapshot.launcher?.wallpaper?.updatedAt ?? 0) as number
      ).toBeGreaterThan(0);
    });
  });
});
