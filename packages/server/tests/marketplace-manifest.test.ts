/**
 * @fileoverview 商城清单缓存与限流兜底测试
 *
 * 覆盖：
 * - TTL 缓存命中与过期重拉
 * - 拉取失败时的 stale 兜底
 * - 429 退避窗口的进入、跨清单生效与过期恢复
 * - 无缓存时的失败语义保持
 * - Retry-After 解析的默认值与上限
 *
 * 时间用 setSystemTime 虚拟推进，不发真实网络请求。
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  mock,
  setSystemTime,
} from 'bun:test';
import type { MarketplaceEntry } from '@persona/shared';

// 静音日志
mock.module('../src/util/logger.js', () => ({
  Logger: {
    log: () => {},
    initialize: () => '',
    setEnabled: () => {},
    setSessionManagers: () => {},
  },
}));

import {
  fetchManifest,
  fetchMcpManifest,
  resetManifestCache,
} from '../src/marketplace/manifest.js';

const realFetch = globalThis.fetch;

/** 一条合法的 Skill 清单条目 */
const SKILL_ENTRY = {
  name: '测试技能',
  description: 'desc',
  author: 'a',
  homepage: 'https://example.com',
  path: 'skills/test-skill',
};

/** fetch mock 的调用次数与行为，由各用例定制 */
let fetchCalls: number;
let fetchImpl: () => Response;

/** 虚拟时钟推进 ms 毫秒 */
function advance(ms: number): void {
  setSystemTime(Date.now() + ms);
}

beforeEach(() => {
  resetManifestCache();
  setSystemTime(new Date('2026-08-18T00:00:00Z'));
  fetchCalls = 0;
  fetchImpl = () =>
    new Response(JSON.stringify([SKILL_ENTRY]), { status: 200 });
  globalThis.fetch = (async () => {
    fetchCalls++;
    return fetchImpl();
  }) as unknown as typeof fetch;
});

afterEach(() => {
  setSystemTime();
  globalThis.fetch = realFetch;
});

describe('TTL cache', () => {
  it('serves from cache within TTL without network', async () => {
    const first = await fetchManifest();
    const second = await fetchManifest();

    expect(fetchCalls).toBe(1);
    expect(second).toEqual(first);
  });

  it('refetches after TTL expires', async () => {
    await fetchManifest();
    advance(6 * 60_000);
    await fetchManifest();

    expect(fetchCalls).toBe(2);
  });
});

describe('stale fallback', () => {
  it('serves stale data when fetch fails after TTL', async () => {
    const primed = await fetchManifest();
    advance(6 * 60_000);
    fetchImpl = () => new Response('rate limited', { status: 429 });

    const data = await fetchManifest();

    expect(data).toEqual(primed);
    expect(fetchCalls).toBe(2);
  });

  it('serves stale data when manifest format becomes invalid', async () => {
    await fetchManifest();
    advance(6 * 60_000);
    // 合法 JSON 但形状错误，命中 schema 校验失败分支
    fetchImpl = () => new Response('{}', { status: 200 });

    // 格式非法时走 stale，不向调用方抛错
    const data = await fetchManifest();
    expect(data).toEqual([SKILL_ENTRY]);
  });

  it('throws format error when invalid and no cache', async () => {
    fetchImpl = () => new Response('{}', { status: 200 });

    await expect(fetchManifest()).rejects.toThrow(/format is invalid/);
  });
});

describe('backoff', () => {
  it('does not refetch within Retry-After window', async () => {
    await fetchManifest();
    advance(6 * 60_000);
    fetchImpl = () =>
      new Response('rate limited', {
        status: 429,
        headers: { 'retry-after': '60' },
      });

    // 触发 429，进入退避并走 stale
    const data = await fetchManifest();
    expect(data).toEqual([SKILL_ENTRY]);
    expect(fetchCalls).toBe(2);

    // 窗口内再拉：不发真实请求
    advance(30_000);
    await fetchManifest();
    expect(fetchCalls).toBe(2);
  });

  it('includes remaining backoff seconds in 429 errors without cache', async () => {
    fetchImpl = () =>
      new Response('rate limited', {
        status: 429,
        headers: { 'retry-after': '60' },
      });

    // 首次撞 429 无缓存：提示整个冷却时长
    await expect(fetchManifest()).rejects.toThrow(/429, retry in ~60s/);

    // 冷却过半再请求：提示剩余 30s，且不发真实请求
    advance(30_000);
    await expect(fetchManifest()).rejects.toThrow(/429, retry in ~30s/);
    expect(fetchCalls).toBe(1);
  });

  it('gates other manifest kinds sharing the domain', async () => {
    await fetchMcpManifest();
    advance(6 * 60_000);
    fetchImpl = () => new Response('rate limited', { status: 429 });
    await fetchMcpManifest();

    // skills 无缓存且处于退避窗口：直接抛错且不发包
    await expect(fetchManifest()).rejects.toThrow(/429/);
    expect(fetchCalls).toBe(2);
  });

  it('recovers after default backoff when Retry-After missing', async () => {
    fetchImpl = () => new Response('rate limited', { status: 429 });
    await expect(fetchManifest()).rejects.toThrow(/429/);

    // 无 Retry-After 头，默认退避 60s；到期后恢复拉取
    advance(61_000);
    fetchImpl = () =>
      new Response(JSON.stringify([SKILL_ENTRY]), { status: 200 });
    const data = await fetchManifest();

    expect(data).toEqual([SKILL_ENTRY]);
    expect(fetchCalls).toBe(2);
  });

  it('caps backoff duration at MAX_BACKOFF_MS', async () => {
    await fetchManifest();
    advance(6 * 60_000);
    fetchImpl = () =>
      new Response('rate limited', {
        status: 429,
        headers: { 'retry-after': '3600' },
      });
    await fetchManifest();

    // 声称退避 1 小时，实际封顶 10 分钟；之后应重新尝试
    advance(10 * 60_000 + 1_000);
    fetchImpl = () =>
      new Response(JSON.stringify([SKILL_ENTRY]), { status: 200 });
    const data = await fetchManifest();

    expect(data).toEqual([SKILL_ENTRY]);
    expect(fetchCalls).toBe(3);
  });
});
