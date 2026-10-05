/**
 * @fileoverview 商城本地图标测试。
 * 覆盖解析助手的两级顺序与坏文件名拒绝、安装 meta 的 logoFile 往返、
 * skill 与 MCP 两条 logo 路由的回图、缓存头与错误码。
 */

import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import express, { type Express } from 'express';
import { createServer, type Server } from 'http';
import * as net from 'node:net';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/** 临时测试目录 */
let tempDir: string;
let skillsDir: string;
let serversDir: string;

let app: Express;
let server: Server;
let baseUrl: string;

mock.module('../src/util/paths.js', () => ({
  getSkillsDir: () => skillsDir,
  getMcpServersDir: () => serversDir,
}));

mock.module('../src/util/logger.js', () => ({
  Logger: {
    log: () => {},
  },
}));

import { resolveLocalLogoFile } from '../src/util/local-logo.js';
import { writeSkillMeta, loadSkillFile } from '../src/skill/loader.js';
import { writeMcpMeta, readMcpMeta } from '../src/mcp/meta.js';
import { createSkillRouter } from '../src/server/routers/skill.js';
import { createMcpRouter } from '../src/server/routers/mcp.js';

/** 查找可用端口，避免端口冲突 */
function findAvailablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on('error', reject);
    probe.listen(0, '0.0.0.0', () => {
      const port = (probe.address() as net.AddressInfo).port;
      probe.close(() => resolve(port));
    });
  });
}

/** 造一个带图标的已安装技能目录 */
function makeSkillDir(
  name: string,
  meta: { logoUrl?: string; logoFile?: string } = {},
  logoName?: string
): string {
  const dir = path.join(skillsDir, name);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'SKILL.md'),
    `---
name: ${name}
description: test skill
---

body`
  );
  writeSkillMeta(dir, meta);
  if (logoName) {
    fs.writeFileSync(path.join(dir, logoName), `${name}-logo-bytes`);
  }
  return dir;
}

/** 造一个带图标的已安装 MCP 服务目录 */
function makeServerDir(
  name: string,
  meta: { logoUrl?: string; logoFile?: string } = {},
  logoName?: string
): string {
  const dir = path.join(serversDir, name);
  fs.mkdirSync(dir, { recursive: true });
  writeMcpMeta(dir, meta);
  if (logoName) {
    fs.writeFileSync(path.join(dir, logoName), `${name}-logo-bytes`);
  }
  return dir;
}

describe('resolveLocalLogoFile', () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-logo-test-'));
    skillsDir = path.join(tempDir, 'skills');
    serversDir = path.join(tempDir, 'servers');
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('resolves by the logoFile field when the file exists', () => {
    makeSkillDir('by-file', { logoFile: 'icon.png' }, 'icon.png');

    const resolved = resolveLocalLogoFile(path.join(skillsDir, 'by-file'), {
      logoFile: 'icon.png',
    });

    expect(resolved).toBe(path.join(skillsDir, 'by-file', 'icon.png'));
  });

  it('resolves from the remote url tail for legacy installs', () => {
    makeSkillDir('by-tail', {}, 'logo.svg');

    const resolved = resolveLocalLogoFile(path.join(skillsDir, 'by-tail'), {
      logoUrl:
        'https://raw.githubusercontent.com/o/r/main/skills/by-tail/logo.svg',
    });

    expect(resolved).toBe(path.join(skillsDir, 'by-tail', 'logo.svg'));
  });

  it('cuts the query string off the url tail before matching', () => {
    makeSkillDir('by-query', {}, 'logo.png');

    const resolved = resolveLocalLogoFile(path.join(skillsDir, 'by-query'), {
      logoUrl: 'https://cdn.example.com/skills/by-query/logo.png?v=2',
    });

    expect(resolved).toBe(path.join(skillsDir, 'by-query', 'logo.png'));
  });

  it('returns undefined when the local file is missing', () => {
    makeSkillDir('missing-file', { logoFile: 'gone.png' });

    const resolved = resolveLocalLogoFile(
      path.join(skillsDir, 'missing-file'),
      {
        logoFile: 'gone.png',
        logoUrl: 'https://cdn.example.com/skills/missing-file/gone.png',
      }
    );

    expect(resolved).toBeUndefined();
  });

  it('rejects candidate names carrying path segments', () => {
    const resolved = resolveLocalLogoFile(skillsDir, {
      logoFile: '../escape.png',
    });

    expect(resolved).toBeUndefined();
  });

  it('returns undefined for meta without any logo record', () => {
    makeSkillDir('no-logo');

    const resolved = resolveLocalLogoFile(path.join(skillsDir, 'no-logo'), {});

    expect(resolved).toBeUndefined();
  });
});

describe('install meta logoFile roundtrip', () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-logo-meta-'));
    skillsDir = path.join(tempDir, 'skills');
    serversDir = path.join(tempDir, 'servers');
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('keeps logoFile through writeSkillMeta and loadSkillFile', () => {
    makeSkillDir('roundtrip-skill', { logoFile: 'icon.png' }, 'icon.png');

    const skill = loadSkillFile(
      path.join(skillsDir, 'roundtrip-skill', 'SKILL.md')
    );

    expect(skill?.logoFile).toBe('icon.png');
  });

  it('keeps logoFile through writeMcpMeta and readMcpMeta', () => {
    makeServerDir(
      'roundtrip-mcp',
      {
        logoUrl: 'https://cdn.example.com/mcp/roundtrip-mcp/logo.svg',
        logoFile: 'logo.svg',
      },
      'logo.svg'
    );

    const meta = readMcpMeta('roundtrip-mcp');

    expect(meta?.logoFile).toBe('logo.svg');
    expect(meta?.logoUrl).toBe(
      'https://cdn.example.com/mcp/roundtrip-mcp/logo.svg'
    );
  });
});

describe('logo routes', () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'local-logo-routes-'));
    skillsDir = path.join(tempDir, 'skills');
    serversDir = path.join(tempDir, 'servers');

    makeSkillDir(
      'route-skill',
      {
        logoUrl: 'https://cdn.example.com/skills/route-skill/icon.png',
        logoFile: 'icon.png',
      },
      'icon.png'
    );
    makeSkillDir('route-bare', { logoUrl: 'https://cdn.example.com/bare.png' });
    makeServerDir(
      'route-mcp',
      {
        logoUrl: 'https://cdn.example.com/mcp/route-mcp/logo.svg',
        logoFile: 'logo.svg',
      },
      'logo.svg'
    );
    makeServerDir('route-mcp-bare', {
      logoUrl: 'https://cdn.example.com/mcp/route-mcp-bare/logo.svg',
    });

    app = express();
    app.use('/api/skills', createSkillRouter());
    app.use('/api/mcp', createMcpRouter());

    const port = await findAvailablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    server = createServer(app);
    await new Promise<void>((resolve) =>
      server.listen(port, '127.0.0.1', resolve)
    );
  });

  afterAll(() => {
    server.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('serves the skill logo with immutable cache when h is present', async () => {
    const response = await fetch(
      `${baseUrl}/api/skills/route-skill/logo?h=abc123`
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/png');
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable'
    );
    expect(await response.text()).toBe('route-skill-logo-bytes');
  });

  it('serves the skill logo without long cache when h is absent', async () => {
    const response = await fetch(`${baseUrl}/api/skills/route-skill/logo`);

    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBeNull();
  });

  it('answers 404 when the skill logo file is missing', async () => {
    const response = await fetch(`${baseUrl}/api/skills/route-bare/logo`);

    expect(response.status).toBe(404);
  });

  it('answers 400 for an unsafe skill name', async () => {
    const response = await fetch(`${baseUrl}/api/skills/Bad_Name/logo`);

    expect(response.status).toBe(400);
  });

  it('serves the mcp logo with its svg mime type', async () => {
    const response = await fetch(`${baseUrl}/api/mcp/route-mcp/logo?h=abc123`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/svg+xml');
    expect(response.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable'
    );
    expect(await response.text()).toBe('route-mcp-logo-bytes');
  });

  it('answers 404 when the mcp logo file is missing', async () => {
    const response = await fetch(`${baseUrl}/api/mcp/route-mcp-bare/logo`);

    expect(response.status).toBe(404);
  });
});
