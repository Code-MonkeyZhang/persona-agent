/**
 * @fileoverview Marketplace 模块单元测试
 * 覆盖：名字安全校验、文件夹名解析、下载器的路径安全与失败回滚。
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
import * as path from 'node:path';
import * as os from 'node:os';
import type { MarketplaceEntry } from '@persona/shared';

let tempDir: string;
let skillsDir: string;

// 把路径模块指向临时目录，把日志静音
mock.module('../src/util/paths.js', () => ({
  getSkillsDir: () => skillsDir,
}));

mock.module('../src/util/logger.js', () => ({
  Logger: {
    log: () => {},
  },
}));

import { isSafeSkillName, folderNameOf } from '../src/marketplace/util.js';
import { downloadSkill } from '../src/marketplace/downloader.js';

/** 造一个最小可用的清单条目 */
function makeEntry(folder = 'test-skill'): MarketplaceEntry {
  return {
    name: '测试技能',
    description: 'desc',
    author: 'a',
    homepage: 'https://example.com',
    version: '1.0.0',
    path: `skills/${folder}`,
  };
}

describe('isSafeSkillName', () => {
  it('accepts kebab-case names', () => {
    expect(isSafeSkillName('diary-writing')).toBe(true);
    expect(isSafeSkillName('abc-123')).toBe(true);
    expect(isSafeSkillName('a')).toBe(true);
    expect(isSafeSkillName('x-y-z')).toBe(true);
  });

  it('rejects traversal and path separators', () => {
    expect(isSafeSkillName('..')).toBe(false);
    expect(isSafeSkillName('../etc')).toBe(false);
    expect(isSafeSkillName('/etc/passwd')).toBe(false);
    expect(isSafeSkillName('a/b')).toBe(false);
  });

  it('rejects uppercase, underscore, space, empty, leading dash', () => {
    expect(isSafeSkillName('Diary')).toBe(false);
    expect(isSafeSkillName('diary_writing')).toBe(false);
    expect(isSafeSkillName('diary writing')).toBe(false);
    expect(isSafeSkillName('')).toBe(false);
    expect(isSafeSkillName('-abc')).toBe(false);
  });
});

describe('folderNameOf', () => {
  it('returns the last path segment', () => {
    expect(folderNameOf({ path: 'skills/diary-writing' })).toBe('diary-writing');
    expect(folderNameOf({ path: 'skills/group/sub' })).toBe('sub');
    expect(folderNameOf({ path: 'skills/a' })).toBe('a');
  });
});

describe('downloadSkill', () => {
  const realFetch = globalThis.fetch;
  /** CDN URL 里 skill 文件夹的标记，用于切出相对文件名 */
  const MARKER = '/skills/test-skill/';

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marketplace-test-'));
    skillsDir = path.join(tempDir, 'skills');
  });

  afterAll(() => {
    globalThis.fetch = realFetch;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    if (fs.existsSync(skillsDir)) {
      fs.rmSync(skillsDir, { recursive: true, force: true });
    }
  });

  /**
   * 造一个按 URL 分流的 fetch mock：
    * - data.jsdelivr.com → 返回 names 指定的文件清单
    * - cdn.jsdelivr.net → 按 cdnResponses[相对文件名] 返回，默认 200 'ok'
   */
  function mockFetch(
    names: string[],
    cdnResponses: Record<string, { status?: number; body?: string }> = {}
  ) {
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes('data.jsdelivr.com')) {
        const files = names.map((n) => ({ name: `${MARKER}${n}` }));
        return new Response(JSON.stringify({ files }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      // CDN：切出相对文件名
      const idx = u.indexOf(MARKER);
      const rel = idx >= 0 ? u.slice(idx + MARKER.length) : '';
      const cfg = cdnResponses[rel] ?? { body: 'ok' };
      return new Response(cfg.body ?? 'ok', { status: cfg.status ?? 200 });
    }) as unknown as typeof fetch;
  }

  it('writes all files into the skill folder', async () => {
    mockFetch(['SKILL.md', 'assets/icon.png'], {
      'SKILL.md': { body: '---\nname: test-skill\ndescription: d\n---\nbody' },
      'assets/icon.png': { body: 'asset-bytes' },
    });

    const dir = await downloadSkill(makeEntry());

    expect(dir).toBe(path.join(skillsDir, 'test-skill'));
    expect(fs.existsSync(path.join(dir, 'SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(dir, 'assets', 'icon.png'))).toBe(true);
  });

  it('rejects path traversal and leaves nothing outside the skill folder', async () => {
    // jsDelivr 列表返回一个越界的相对路径，下载器必须拒绝
    globalThis.fetch = mock(async (url: string | URL | Request) => {
      const u = url.toString();
      if (u.includes('data.jsdelivr.com')) {
        return new Response(
          JSON.stringify({ files: [{ name: `${MARKER}../../evil.txt` }] }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }
      return new Response('x', { status: 200 });
    }) as unknown as typeof fetch;

    await expect(downloadSkill(makeEntry())).rejects.toThrow(/Unsafe file path/);

    // 越界目标不应被创建
    expect(fs.existsSync(path.join(skillsDir, 'evil.txt'))).toBe(false);
    // 失败回滚：skill 目录被清理
    expect(fs.existsSync(path.join(skillsDir, 'test-skill'))).toBe(false);
  });

  it('rolls back already-written files when a file fails', async () => {
    mockFetch(['SKILL.md', 'second.md'], {
      'second.md': { status: 500 },
    });

    await expect(downloadSkill(makeEntry())).rejects.toThrow(
      /Failed to download/
    );

    // 第一个文件虽可能已写入，但回滚后应被删除，整个 skill 目录也不存在
    expect(fs.existsSync(path.join(skillsDir, 'test-skill'))).toBe(false);
  });
});
