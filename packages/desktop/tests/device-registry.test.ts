/**
 * @fileoverview 设备清单测试：读写往返、缺失回退、形状归一与本机条目落位。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  DeviceRegistry,
  emptyRegistry,
} from '../src/main/host/device-registry';

/** 本机服务器主机号的测试取值 */
const SERVER = '02569d60';

/** 临时目录 */
let tempDir: string;
/** 清单文件路径 */
let filePath: string;
/** 被测实例 */
let registry: DeviceRegistry;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'device-registry-test-'));
  filePath = path.join(tempDir, 'config', 'devices.json');
  registry = new DeviceRegistry(filePath);
});

afterEach(() => {
  fs.rmSync(tempDir, { recursive: true, force: true });
});

describe('device registry', () => {
  /** 文件缺失时回退空清单 */
  it('falls back to an empty registry when the file is missing', () => {
    expect(registry.load()).toEqual(emptyRegistry());
  });

  /** 损坏 JSON 回退空清单 */
  it('falls back on corrupt json', () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{broken', 'utf-8');
    expect(registry.load()).toEqual(emptyRegistry());
  });

  /** 读写往返保持全部字段 */
  it('roundtrips entries through save and load', () => {
    const data = emptyRegistry();
    data.devices.push({
      hostId: 'remote-1',
      name: '工作室电脑',
      address: 'https://studio.example.com',
      lastConnectedAt: 123,
      local: false,
    });
    data.currentHostId = 'remote-1';
    registry.save(data);

    expect(registry.load()).toEqual(data);
  });

  /** 读入时给缺 local 字段的旧条目补 false */
  it('normalizes the local flag of legacy entries', () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        currentHostId: 'remote-1',
        devices: [
          {
            hostId: 'remote-1',
            name: null,
            address: 'http://x',
            lastConnectedAt: 1,
          },
        ],
      }),
      'utf-8'
    );
    expect(registry.load().devices[0].local).toBe(false);
  });

  /** 旧模型的 hostName 字段读入时迁移为本地标签，改过名的直接丢弃，重跑幂等 */
  it('migrates legacy hostName into the local label', () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        currentHostId: 'remote-1',
        devices: [
          { hostId: 'old-server', name: null, hostName: null, address: null, lastConnectedAt: null },
          { hostId: 'remote-1', name: null, hostName: 'studio', address: 'http://x', lastConnectedAt: 1 },
          { hostId: 'remote-2', name: '改名过的', hostName: 'nas', address: 'http://y', lastConnectedAt: 2 },
        ],
      }),
      'utf-8'
    );
    const first = registry.load();
    expect(first.devices.find((d) => d.hostId === 'remote-1')?.name).toBe('studio');
    expect(first.devices.find((d) => d.hostId === 'remote-2')?.name).toBe('改名过的');
    registry.save(first);
    expect(fs.readFileSync(filePath, 'utf-8')).not.toContain('hostName');
    expect(registry.load()).toEqual(first);
  });

  /** 原子写不在目录里留临时文件 */
  it('leaves no temp file after save', () => {
    registry.save(emptyRegistry());
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
    expect(fs.existsSync(filePath)).toBe(true);
  });
});

describe('setLocalEntry', () => {
  /** 首次落位建本机条目 */
  it('registers the local entry on first settlement', () => {
    expect(registry.setLocalEntry(SERVER)).toBeNull();
    const data = registry.load();
    expect(data.devices).toHaveLength(1);
    expect(data.devices[0]).toMatchObject({
      hostId: SERVER,
      address: null,
      local: true,
    });
  });

  /** 旧清单里字面量主机号的本机条目改写成真实主机号并打标记 */
  it('rewrites the legacy literal local entry to the real identity', () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        currentHostId: 'local',
        devices: [
          { hostId: 'local', name: '我的电脑', address: null, lastConnectedAt: 1 },
        ],
      }),
      'utf-8'
    );

    expect(registry.setLocalEntry(SERVER)).toBeNull();
    const entry = registry.load().devices[0];
    expect(entry.hostId).toBe(SERVER);
    expect(entry.name).toBe('我的电脑');
    expect(entry.local).toBe(true);
  });

  /** 身份不变时幂等不产生替换 */
  it('is idempotent when the identity is unchanged', () => {
    registry.setLocalEntry(SERVER);
    expect(registry.setLocalEntry(SERVER)).toBeNull();
    expect(registry.load().devices).toHaveLength(1);
  });

  /** 身份变化时原位改写并返回旧主机号 */
  it('replaces a changed identity and returns the previous host id', () => {
    registry.setLocalEntry(SERVER);
    expect(registry.setLocalEntry('new-server')).toBe(SERVER);
    const entry = registry.load().devices.find((d) => d.local);
    expect(entry?.hostId).toBe('new-server');
  });
});
