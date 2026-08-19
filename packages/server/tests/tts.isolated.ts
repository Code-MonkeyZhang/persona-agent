/**
 * @fileoverview TTS 功能集成测试
 *
 * 覆盖范围：
 * - cleanText 纯函数单元测试
 * - TTS 路由集成测试
 * - 聊天 TTS WebSocket 事件流集成测试
 *
 * Mock 策略：
 * - 文件系统：mock paths.js 到临时目录
 * - MiniMax API：mock minimax-api.ts 避免调用真实外部 API
 * - Agent 循环：mock pi-models.js 的 models.stream，返回固定文本
 * - Express + WebSocket：真实启动
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
import * as path from 'node:path';
import * as os from 'node:os';
import * as net from 'node:net';
import { WebSocket } from 'ws';

let tempDir: string;
let agentsDir: string;
let authPath: string;
let configDir: string;
let ttsConfigPath: string;
let configPath: string;

mock.module('../src/util/paths.js', () => ({
  getAgentsDir: () => path.join(agentsDir),
  getAgentDir: (id: string) => path.join(agentsDir, id),
  getAgentConfigPath: (id: string) => path.join(agentsDir, id, 'config.json'),
  getAgentSystemPromptPath: (id: string) => path.join(agentsDir, id, 'systemPrompt.md'),
  getAgentAssetsDir: (id: string) => path.join(agentsDir, id, 'assets'),
  getAgentAssetsPoseDir: (id: string) => path.join(agentsDir, id, 'assets', 'pose'),
  getAgentAssetsBackgroundsDir: (id: string) => path.join(agentsDir, id, 'assets', 'backgrounds'),
  getAgentSessionsDir: (id: string) => path.join(agentsDir, id, 'sessions'),
  getAgentMemoryDir: (id: string) => path.join(agentsDir, id, 'memory'),
  getAuthPath: () => authPath,
  getConfigDir: () => configDir,
  getConfigPath: () => configPath,
  getTtsConfigPath: () => ttsConfigPath,
}));

mock.module('../src/tts/minimax-api.js', () => ({
  uploadAudio: () => Promise.resolve(12345),
  cloneVoice: () => Promise.resolve(),
  verifyVoice: () => Promise.resolve(),
}));

mock.module('../src/auth/index.js', () => ({
  getAuth: () => ({ apiKey: 'test-llm-key' }),
  listProvidersWithAuth: () => [],
}));

mock.module('../src/config/index.js', () => ({
  loadConfig: () => ({
    enableLogging: false,
  }),
  saveConfig: () => {},
  getDefaultConfigYaml: () => 'enableLogging: false\n',
}));

// pi-ai 0.80+ 起 LLM 调用统一经 pi-models.js 的 models 实例，mock 该模块即可拦截
// 全部调用方；不要改回 mock '@earendil-works/pi-ai' 主入口——converter 运行时
// 依赖其中的 Type，mock 掉会导致工具 schema 转换崩溃。
mock.module('../src/agent/pi-models.js', () => ({
  models: {
    stream: () => {
      function* fakeStream() {
        yield { type: 'text_delta', delta: '你好，我是助手。' };
        yield { type: 'done' };
      }
      return fakeStream();
    },
    getModel: () => ({ id: 'test-model' }),
  },
}));

import { cleanText } from '../src/tts/text-processor.js';
import { createTtsRouter } from '../src/server/routers/tts.js';
import { createVoiceRouter } from '../src/server/routers/voice.js';
import { createAgentRouter, type SessionManagersMap } from '../src/server/routers/agent.js';
import { createSessionRouter } from '../src/server/routers/session.js';
import { createChatRouter } from '../src/server/routers/chat.js';
import { createProviderRouter, createAuthRouter } from '../src/server/routers/auth.js';
import { initWebSocket, shutdownWebSocket } from '../src/server/websocket-server.js';
import type { AgentConfig, AgentConfigInput } from '../src/agent/index.js';
import type { Session } from '../src/session/types.js';

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

let app: Express;
let httpServer: Server;
let PORT: number;
let BASE_URL: string;
let WS_URL: string;
let sessionManagers: SessionManagersMap;

const defaultModel = { provider: 'openai', model: 'gpt-4' };

function createTestAgentInput(
  overrides: Partial<AgentConfigInput> = {},
): AgentConfigInput {
  return {
    name: 'Test Agent',
    systemPrompt: 'You are a helpful assistant.',
    defaultModel,
    maxSteps: 10,
    mcpNames: [],
    skillNames: [],
    ...overrides,
  };
}

async function setupAuth(): Promise<void> {
  await fetch(`${BASE_URL}/api/auth/${defaultModel.provider}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apiKey: 'test-key' }),
  });
}

async function createTestAgent(
  overrides: Partial<AgentConfigInput> = {},
): Promise<string> {
  const response = await fetch(`${BASE_URL}/api/agents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(createTestAgentInput(overrides)),
  });
  const { agent } = (await response.json()) as { agent: AgentConfig };
  return agent.id;
}

async function createTestSession(agentId: string): Promise<string> {
  const response = await fetch(
    `${BASE_URL}/api/agents/${agentId}/sessions`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test Session' }),
    },
  );
  const { session } = (await response.json()) as { session: Session };
  return session.id;
}

function writeTtsConfig(config: {
  apiKey?: string;
  model?: string;
  clonedVoices?: Array<{ voice_id: string; name: string }>;
  summaryThreshold?: number;
}): void {
  fs.writeFileSync(
    ttsConfigPath,
    JSON.stringify(
      {
        apiKey: config.apiKey ?? '',
        model: config.model ?? 'speech-2.8-hd',
        clonedVoices: config.clonedVoices ?? [],
        summaryThreshold: config.summaryThreshold ?? 200,
      },
      null,
      2,
    ),
  );
}

describe('TTS Integration Tests', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tts-test-'));
    agentsDir = path.join(tempDir, 'agents');
    configDir = path.join(tempDir, 'config');
    authPath = path.join(configDir, 'auth.json');
    ttsConfigPath = path.join(configDir, 'minimax-tts.json');
    configPath = path.join(configDir, 'config.yaml');

    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(
      configPath,
      'enableLogging: false\n',
    );
    writeTtsConfig({});

    sessionManagers = new Map();
    app = express();
    app.use(express.json());

    app.use('/api/providers', createProviderRouter());
    app.use('/api/auth', createAuthRouter());
    app.use('/api/tts', createTtsRouter());
    app.use('/api/voices', createVoiceRouter());
    app.use('/api/agents', createAgentRouter(sessionManagers));
    app.use(
      '/api/agents/:agentId/sessions',
      createSessionRouter(sessionManagers),
    );
    app.use(
      '/api/agents/:agentId/sessions/:sessionId/chat',
      createChatRouter(sessionManagers),
    );

    PORT = await findAvailablePort();
    BASE_URL = `http://localhost:${PORT}`;
    WS_URL = `ws://localhost:${PORT}/ws`;

    httpServer = createServer(app);
    initWebSocket(httpServer);

    await new Promise<void>((resolve) => {
      httpServer.listen(PORT, '0.0.0.0', () => resolve());
    });
  });

  afterAll(async () => {
    shutdownWebSocket();
    httpServer.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('cleanText', () => {
    it('should strip Markdown, code blocks, links, HTML, and normalize whitespace', () => {
      const input = [
        '## Heading',
        '',
        'Here is **bold** and _italic_ text.',
        'Check [this link](https://example.com) for more.',
        '',
        '```python',
        'print("hello")',
        '```',
        '',
        '<p>HTML content</p>',
        '',
        'End.',
      ].join('\n');

      const result = cleanText(input);

      expect(result).not.toContain('##');
      expect(result).not.toContain('**');
      expect(result).not.toContain('```');
      expect(result).not.toContain('print');
      expect(result).not.toContain('<p>');
      expect(result).toContain('bold');
      expect(result).toContain('italic');
      expect(result).toContain('this link');
      expect(result).toContain('HTML content');
      expect(result).toContain('End.');
    });

    it('should return empty string for empty input', () => {
      expect(cleanText('')).toBe('');
    });

    it('should preserve plain text unchanged', () => {
      const plain = 'Hello world, this is a test.';
      expect(cleanText(plain)).toBe(plain);
    });
  });

  describe('TTS Routes', () => {
    beforeEach(() => {
      writeTtsConfig({});
    });

    it('should return 2 TTS models', async () => {
      const response = await fetch(`${BASE_URL}/api/tts/models`);
      const data = (await response.json()) as {
        models: Array<{ id: string; name: string }>;
      };

      expect(data.models).toHaveLength(2);
      expect(data.models[0].id).toBe('speech-2.8-hd');
    });

    it('should return default config', async () => {
      const response = await fetch(`${BASE_URL}/api/tts/config`);
      const data = (await response.json()) as {
        config: {
          apiKey: string;
          model: string;
          clonedVoices: unknown[];
          summaryThreshold: number;
        };
      };

      expect(data.config.apiKey).toBe('');
      expect(data.config.model).toBe('speech-2.8-hd');
      expect(data.config.clonedVoices).toEqual([]);
      expect(data.config.summaryThreshold).toBe(200);
    });

    it('should migrate summaryThreshold from legacy config.yaml', async () => {
      // 模拟旧版用户：config.yaml 有 tts.summaryThreshold=500，minimax-tts.json 无此字段
      fs.writeFileSync(
        ttsConfigPath,
        JSON.stringify({ apiKey: '', model: 'speech-2.8-hd', clonedVoices: [] }, null, 2),
      );
      fs.writeFileSync(
        configPath,
        'enableLogging: false\ntts:\n  summaryThreshold: 500\n',
      );

      // GET 触发迁移：从 config.yaml 读 500，持久化到 minimax-tts.json
      const response = await fetch(`${BASE_URL}/api/tts/config`);
      const data = (await response.json()) as {
        config: { summaryThreshold: number };
      };

      expect(data.config.summaryThreshold).toBe(500);

      // 验证迁移已持久化到 minimax-tts.json
      const persisted = JSON.parse(fs.readFileSync(ttsConfigPath, 'utf-8'));
      expect(persisted.summaryThreshold).toBe(500);

      // 恢复测试环境
      writeTtsConfig({});
      fs.writeFileSync(configPath, 'enableLogging: false\n');
    });

    it('should update and persist apiKey', async () => {
      await fetch(`${BASE_URL}/api/tts/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: 'sk-test-key-123' }),
      });

      const response = await fetch(`${BASE_URL}/api/tts/config`);
      const data = (await response.json()) as {
        config: { apiKey: string; model: string };
      };

      expect(data.config.apiKey).toBe('sk-test-key-123');
      expect(data.config.model).toBe('speech-2.8-hd');
    });

    it('should return 58 preset voices with no clones', async () => {
      const response = await fetch(`${BASE_URL}/api/voices`);
      const data = (await response.json()) as {
        voices: Array<{ id: string; group: string }>;
      };

      expect(data.voices).toHaveLength(58);
      expect(data.voices.every((v) => v.group === 'preset')).toBe(true);
    });

    it('should clone a voice and show it in list', async () => {
      const formData = new FormData();
      formData.append(
        'file',
        new Blob([Buffer.alloc(1024)], { type: 'audio/mpeg' }),
        'test-audio.mp3',
      );
      formData.append('voice_id', 'testVoice01');
      formData.append('name', 'Test Clone');

      const cloneResponse = await fetch(`${BASE_URL}/api/voices/clone`, {
        method: 'POST',
        body: formData,
      });

      expect(cloneResponse.status).toBe(200);
      const cloneData = (await cloneResponse.json()) as { success: boolean };
      expect(cloneData.success).toBe(true);

      const listResponse = await fetch(`${BASE_URL}/api/voices`);
      const listData = (await listResponse.json()) as {
        voices: Array<{ id: string; group: string }>;
      };

      expect(listData.voices).toHaveLength(59);
      expect(listData.voices[0].id).toBe('testVoice01');
      expect(listData.voices[0].group).toBe('cloned');
    });

    it('should delete a cloned voice', async () => {
      writeTtsConfig({
        apiKey: 'sk-test',
        clonedVoices: [{ voice_id: 'myVoice01', name: 'My Voice' }],
      });

      const delResponse = await fetch(
        `${BASE_URL}/api/voices/clone/myVoice01`,
        { method: 'DELETE' },
      );

      expect(delResponse.status).toBe(200);

      const listResponse = await fetch(`${BASE_URL}/api/voices`);
      const listData = (await listResponse.json()) as {
        voices: Array<{ id: string }>;
      };

      expect(listData.voices.some((v) => v.id === 'myVoice01')).toBe(false);
      expect(listData.voices).toHaveLength(58);
    });
  });

  describe('Chat TTS Events', () => {
    let agentId: string;
    let sessionId: string;

    beforeEach(async () => {
      if (fs.existsSync(agentsDir)) {
        fs.rmSync(agentsDir, { recursive: true, force: true });
      }
      sessionManagers.clear();
      writeTtsConfig({ apiKey: 'sk-test-tts-key' });

      await setupAuth();
      agentId = await createTestAgent({
        voiceId: 'male-qn-qingse',
        voiceLanguage: undefined,
      });
      sessionId = await createTestSession(agentId);
    });

    it(
      'should broadcast speak_ready when voiceEnabled and config is valid',
      async () => {
        const receivedEvents: Array<Record<string, unknown>> = [];

        await new Promise<void>((resolve, reject) => {
          const ws = new WebSocket(WS_URL);

          ws.on('open', () => {
            ws.send(
              JSON.stringify({
                type: 'subscribe',
                payload: { sessionId },
              }),
            );
          });

          ws.on('message', (data: Buffer) => {
            const msg = JSON.parse(data.toString()) as Record<string, unknown>;
            receivedEvents.push(msg);

            if (msg.type === 'speak_ready' || msg.type === 'speak_error') {
              ws.close();
              resolve();
            }
          });

          ws.on('error', reject);

          setTimeout(() => {
            fetch(
              `${BASE_URL}/api/agents/${agentId}/sessions/${sessionId}/chat`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  content: '你好',
                  voiceEnabled: true,
                }),
              },
            ).catch(reject);
          }, 100);
        });

        const speakReady = receivedEvents.find(
          (e) => e.type === 'speak_ready',
        );
        expect(speakReady).toBeDefined();
        expect(speakReady!.speakText).toBeDefined();
        expect(speakReady!.voiceId).toBe('male-qn-qingse');
        expect(speakReady!.apiKey).toBe('sk-test-tts-key');
        expect(speakReady!.model).toBe('speech-2.8-hd');

        const completeIdx = receivedEvents.findIndex(
          (e) => e.type === 'complete',
        );
        const speakIdx = receivedEvents.findIndex(
          (e) => e.type === 'speak_ready',
        );
        expect(completeIdx).toBeLessThan(speakIdx);
      },
      15000,
    );

    it('should not push any TTS event when voiceEnabled is false', async () => {
      const receivedEvents: string[] = [];

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(WS_URL);

        ws.on('open', () => {
          ws.send(
            JSON.stringify({
              type: 'subscribe',
              payload: { sessionId },
            }),
          );
        });

        ws.on('message', (data: Buffer) => {
          const msg = JSON.parse(data.toString()) as { type: string };
          receivedEvents.push(msg.type);

          if (msg.type === 'complete') {
            setTimeout(() => {
              ws.close();
              resolve();
            }, 500);
          }
        });

        ws.on('error', reject);

        setTimeout(() => {
          fetch(
            `${BASE_URL}/api/agents/${agentId}/sessions/${sessionId}/chat`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ content: '你好', voiceEnabled: false }),
            },
          ).catch(reject);
        }, 100);
      });

      expect(receivedEvents).not.toContain('speak_ready');
      expect(receivedEvents).not.toContain('speak_error');
      expect(receivedEvents).toContain('complete');
    });

    it('should broadcast speak_error when apiKey is empty', async () => {
      writeTtsConfig({ apiKey: '' });

      const receivedEvents: Array<Record<string, unknown>> = [];

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(WS_URL);

        ws.on('open', () => {
          ws.send(
            JSON.stringify({
              type: 'subscribe',
              payload: { sessionId },
            }),
          );
        });

        ws.on('message', (data: Buffer) => {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>;
          receivedEvents.push(msg);

          if (msg.type === 'speak_error' || msg.type === 'speak_ready') {
            ws.close();
            resolve();
          }
        });

        ws.on('error', reject);

        setTimeout(() => {
          fetch(
            `${BASE_URL}/api/agents/${agentId}/sessions/${sessionId}/chat`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: '你好',
                voiceEnabled: true,
              }),
            },
          ).catch(reject);
        }, 100);
      });

      const speakError = receivedEvents.find(
        (e) => e.type === 'speak_error',
      );
      expect(speakError).toBeDefined();
      expect(speakError!.reason).toBe('no_api_key');
    });

    it('should broadcast speak_error when voiceId not found (lazy forget)', async () => {
      if (fs.existsSync(agentsDir)) {
        fs.rmSync(agentsDir, { recursive: true, force: true });
      }
      sessionManagers.clear();

      await setupAuth();
      agentId = await createTestAgent({ voiceId: 'deleted-voice-xxx' });
      sessionId = await createTestSession(agentId);

      writeTtsConfig({ apiKey: 'sk-test-tts-key' });

      const receivedEvents: Array<Record<string, unknown>> = [];

      await new Promise<void>((resolve, reject) => {
        const ws = new WebSocket(WS_URL);

        ws.on('open', () => {
          ws.send(
            JSON.stringify({
              type: 'subscribe',
              payload: { sessionId },
            }),
          );
        });

        ws.on('message', (data: Buffer) => {
          const msg = JSON.parse(data.toString()) as Record<string, unknown>;
          receivedEvents.push(msg);

          if (msg.type === 'speak_error' || msg.type === 'speak_ready') {
            ws.close();
            resolve();
          }
        });

        ws.on('error', reject);

        setTimeout(() => {
          fetch(
            `${BASE_URL}/api/agents/${agentId}/sessions/${sessionId}/chat`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                content: '你好',
                voiceEnabled: true,
              }),
            },
          ).catch(reject);
        }, 100);
      });

      const speakError = receivedEvents.find(
        (e) => e.type === 'speak_error',
      );
      expect(speakError).toBeDefined();
      expect(speakError!.reason).toBe('voice_not_found');
    });
  });
});
