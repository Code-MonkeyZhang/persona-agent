/**
 * @fileoverview 素材哈希链集成测试。
 * 覆盖 getFileHash 工具、立绘列表哈希下发、三类图片 GET 的条件缓存头
 * 与 agent 响应的 avatarHash 附加。
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
import * as fs from 'node:fs';
import { rmTempDir } from './temp-cleanup.js';
import * as path from 'node:path';
import * as os from 'node:os';
import * as net from 'node:net';
import { createHash } from 'node:crypto';

/** 临时目录路径 */
let tempDir: string;
/** Agent 配置存储目录 */
let agentsDir: string;

/** Mock 路径模块，使用临时目录 */
mock.module('../src/util/paths.js', () => ({
  getAgentsDir: () => path.join(agentsDir),
  getAgentDir: (id: string) => path.join(agentsDir, id),
  getAgentConfigPath: (id: string) => path.join(agentsDir, id, 'config.json'),
  getAgentSystemPromptPath: (id: string) =>
    path.join(agentsDir, id, 'systemPrompt.md'),
  getAgentAssetsDir: (id: string) => path.join(agentsDir, id, 'assets'),
  getAgentAvatarPath: (id: string) =>
    path.join(agentsDir, id, 'assets', 'avatar.png'),
  getAgentAssetsPoseDir: (id: string) =>
    path.join(agentsDir, id, 'assets', 'pose'),
  getAgentAssetsBackgroundsDir: (id: string) =>
    path.join(agentsDir, id, 'assets', 'backgrounds'),
  getAgentMemoryDir: (id: string) => path.join(agentsDir, id, 'memory'),
  getWorkspaceDir: () => path.join(tempDir, 'workspace'),
  getDbPath: () => path.join(tempDir, 'persona.db'),
}));

import { getFileHash } from '../src/util/asset-hash.js';
import { createAgentRouter } from '../src/server/routers/agent.js';
import { createAssetsRouter } from '../src/server/routers/assets.js';
import { createAvatarRouter } from '../src/server/routers/avatar.js';

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

/** Express 应用实例 */
let app: Express;
/** HTTP 服务器实例 */
let httpServer: Server;
/** 服务器端口 */
let PORT: number;
/** HTTP API 基础 URL */
let BASE_URL: string;

const sha256 = (content: Buffer | string): string =>
  createHash('sha256').update(content).digest('hex');

/** 创建一个测试 Agent 并返回其 ID */
async function createTestAgent(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Asset Agent',
      systemPrompt: 'You are a test assistant.',
      defaultModel: { provider: 'openai', model: 'gpt-4' },
      maxSteps: 10,
    }),
  });
  expect(res.status).toBe(201);
  const data = (await res.json()) as { agent: { id: string } };
  return data.agent.id;
}

describe('Assets Hash Integration Tests', () => {
  /** 初始化测试环境：创建临时目录、启动服务器 */
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'assets-test-'));
    agentsDir = path.join(tempDir, 'agents');

    app = express();
    app.use(express.json());
    app.use('/api/agents', createAgentRouter());
    app.use('/api/agents/:agentId/assets', createAssetsRouter());
    app.use('/api/agents/:agentId/avatar', createAvatarRouter());

    PORT = await findAvailablePort();
    BASE_URL = `http://localhost:${PORT}`;

    httpServer = createServer(app);
    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, '0.0.0.0', () => resolve());
    });
  });

  /** 清理测试环境：关闭服务器、删除临时目录 */
  afterAll(async () => {
    httpServer.close();
    rmTempDir(tempDir);
  });

  /** 每个测试前清理 Agent 目录 */
  beforeEach(() => {
    if (fs.existsSync(agentsDir)) {
      fs.rmSync(agentsDir, { recursive: true, force: true });
    }
  });

  /** getFileHash 工具行为测试 */
  describe('getFileHash', () => {
    it('should return stable hash for unchanged file', () => {
      const file = path.join(tempDir, 'hash-target.png');
      fs.writeFileSync(file, 'stable-content');
      const first = getFileHash(file);
      expect(first).toBe(sha256('stable-content'));
      expect(getFileHash(file)).toBe(first);
    });

    it('should recompute hash after content change', () => {
      const file = path.join(tempDir, 'hash-mutable.png');
      fs.writeFileSync(file, 'version-one');
      const first = getFileHash(file);
      fs.writeFileSync(file, 'version-two-with-longer-size');
      expect(getFileHash(file)).toBe(sha256('version-two-with-longer-size'));
      expect(getFileHash(file)).not.toBe(first);
    });

    it('should return empty string for missing file', () => {
      expect(getFileHash(path.join(tempDir, 'no-such-file.png'))).toBe('');
    });
  });

  /** 立绘列表哈希下发测试 */
  describe('GET /api/agents/:agentId/assets/pose', () => {
    it('should return pose hashes and background hash', async () => {
      const agentId = await createTestAgent();
      const poseDir = path.join(agentsDir, agentId, 'assets', 'pose');
      const bgDir = path.join(agentsDir, agentId, 'assets', 'backgrounds');
      fs.mkdirSync(poseDir, { recursive: true });
      fs.mkdirSync(bgDir, { recursive: true });
      fs.writeFileSync(path.join(poseDir, 'default.png'), 'pose-a');
      fs.writeFileSync(path.join(poseDir, 'smile.jpg'), 'pose-b');
      fs.writeFileSync(path.join(bgDir, 'background.png'), 'bg-content');

      const res = await fetch(`${BASE_URL}/api/agents/${agentId}/assets/pose`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as {
        poses: Array<{ name: string; hash: string }>;
        backgroundHash: string;
      };
      expect(data.poses).toEqual([
        { name: 'default', hash: sha256('pose-a') },
        { name: 'smile', hash: sha256('pose-b') },
      ]);
      expect(data.backgroundHash).toBe(sha256('bg-content'));
    });

    it('should return empty list and empty background hash for new agent', async () => {
      const agentId = await createTestAgent();
      const res = await fetch(`${BASE_URL}/api/agents/${agentId}/assets/pose`);
      const data = (await res.json()) as {
        poses: unknown[];
        backgroundHash: string;
      };
      expect(data.poses).toEqual([]);
      expect(data.backgroundHash).toBe('');
    });
  });

  /** 条件缓存响应头测试，带 h 与不带 h 的双口径 */
  describe('hashed cache headers', () => {
    it('should serve avatar with conditional cache header', async () => {
      const agentId = await createTestAgent();
      const assetsDir = path.join(agentsDir, agentId, 'assets');
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(path.join(assetsDir, 'avatar.png'), 'avatar-bytes');

      const hashed = await fetch(
        `${BASE_URL}/api/agents/${agentId}/avatar?h=abc`
      );
      expect(hashed.status).toBe(200);
      expect(hashed.headers.get('cache-control')).toBe(
        'public, max-age=31536000, immutable'
      );

      const unhashed = await fetch(`${BASE_URL}/api/agents/${agentId}/avatar`);
      expect(unhashed.status).toBe(200);
      expect(unhashed.headers.get('cache-control')).toBe('no-cache');
    });

    it('should serve pose image with conditional cache header', async () => {
      const agentId = await createTestAgent();
      const poseDir = path.join(agentsDir, agentId, 'assets', 'pose');
      fs.mkdirSync(poseDir, { recursive: true });
      fs.writeFileSync(path.join(poseDir, 'default.png'), 'pose-bytes');

      const hashed = await fetch(
        `${BASE_URL}/api/agents/${agentId}/assets/pose/default?h=abc`
      );
      expect(hashed.status).toBe(200);
      expect(hashed.headers.get('cache-control')).toBe(
        'public, max-age=31536000, immutable'
      );

      const unhashed = await fetch(
        `${BASE_URL}/api/agents/${agentId}/assets/pose/default`
      );
      expect(unhashed.status).toBe(200);
      expect(unhashed.headers.get('cache-control')).toBe('no-cache');
    });

    it('should serve background with conditional cache header', async () => {
      const agentId = await createTestAgent();
      const bgDir = path.join(agentsDir, agentId, 'assets', 'backgrounds');
      fs.mkdirSync(bgDir, { recursive: true });
      fs.writeFileSync(path.join(bgDir, 'background.png'), 'bg-bytes');

      const hashed = await fetch(
        `${BASE_URL}/api/agents/${agentId}/assets/background?h=abc`
      );
      expect(hashed.status).toBe(200);
      expect(hashed.headers.get('cache-control')).toBe(
        'public, max-age=31536000, immutable'
      );

      const unhashed = await fetch(
        `${BASE_URL}/api/agents/${agentId}/assets/background`
      );
      expect(unhashed.status).toBe(200);
      expect(unhashed.headers.get('cache-control')).toBe('no-cache');
    });
  });

  /** agent 响应附加 avatarHash 测试 */
  describe('avatarHash distribution', () => {
    it('should attach avatar hash to agent list and update on reupload', async () => {
      const agentId = await createTestAgent();

      const listBefore = (await (
        await fetch(`${BASE_URL}/api/agents`)
      ).json()) as { agents: Array<{ id: string; avatarHash?: string }> };
      expect(listBefore.agents.find((a) => a.id === agentId)?.avatarHash).toBe(
        ''
      );

      const assetsDir = path.join(agentsDir, agentId, 'assets');
      fs.mkdirSync(assetsDir, { recursive: true });
      fs.writeFileSync(
        path.join(assetsDir, 'avatar.png'),
        'avatar-first-version'
      );

      const listAfter = (await (
        await fetch(`${BASE_URL}/api/agents`)
      ).json()) as { agents: Array<{ id: string; avatarHash?: string }> };
      expect(listAfter.agents.find((a) => a.id === agentId)?.avatarHash).toBe(
        sha256('avatar-first-version')
      );

      fs.writeFileSync(
        path.join(assetsDir, 'avatar.png'),
        'avatar-second-version-with-different-size'
      );
      const single = (await (
        await fetch(`${BASE_URL}/api/agents/${agentId}`)
      ).json()) as { agent: { avatarHash?: string } };
      expect(single.agent.avatarHash).toBe(
        sha256('avatar-second-version-with-different-size')
      );
    });

    it('should attach avatar hash on create and update responses', async () => {
      const createRes = await fetch(`${BASE_URL}/api/agents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Hash Check Agent',
          systemPrompt: 'You are a test assistant.',
          defaultModel: { provider: 'openai', model: 'gpt-4' },
          maxSteps: 10,
        }),
      });
      const created = (await createRes.json()) as {
        agent: { id: string; avatarHash?: string };
      };
      expect(created.agent.avatarHash).toBe('');

      const updateRes = await fetch(
        `${BASE_URL}/api/agents/${created.agent.id}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'Renamed Agent' }),
        }
      );
      const updated = (await updateRes.json()) as {
        agent: { avatarHash?: string };
      };
      expect(updated.agent.avatarHash).toBe('');
    });
  });

  /** 立绘上传 multipart 路径测试 */
  describe('POST /api/agents/:agentId/assets/pose/:name', () => {
    it('should upload pose and expose its hash in list', async () => {
      const agentId = await createTestAgent();
      const form = new FormData();
      form.append(
        'pose',
        new Blob(['uploaded-pose-bytes'], { type: 'image/png' }),
        'upload.png'
      );

      const upload = await fetch(
        `${BASE_URL}/api/agents/${agentId}/assets/pose/happy`,
        { method: 'POST', body: form }
      );
      expect(upload.status).toBe(200);

      const list = (await (
        await fetch(`${BASE_URL}/api/agents/${agentId}/assets/pose`)
      ).json()) as { poses: Array<{ name: string; hash: string }> };
      expect(list.poses).toEqual([
        { name: 'happy', hash: sha256('uploaded-pose-bytes') },
      ]);
    });
  });
});
