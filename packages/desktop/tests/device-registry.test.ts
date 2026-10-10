/**
 * @fileoverview 设备清单测试：读写往返、缺失回退、本机条目兜底与原子写。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  DeviceRegistry,
  emptyRegistry,
} from '../src/main/host/device-registry';
import { LOCAL_DEVICE_ID } from '@shared/api';

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
  /** 文件缺失时回退内置本机条目 */
  it('falls back to local-only registry when file is missing', () => {
    expect(registry.load()).toEqual(emptyRegistry());
  });

  /** 损坏 JSON 回退内置本机条目 */
  it('falls back on corrupt json', () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, '{broken', 'utf-8');
    expect(registry.load()).toEqual(emptyRegistry());
  });

  /** 缺本机条目或缺 currentHostId 时补齐 */
  it('ensures local entry and currentHostId', () => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        currentHostId: 'remote-1',
        devices: [
          {
            hostId: 'remote-1',
            name: null,
            hostName: 'studio',
            address: 'http://x',
            lastConnectedAt: 1,
          },
        ],
      }),
      'utf-8'
    );
    const data = registry.load();
    expect(data.currentHostId).toBe('remote-1');
    expect(data.devices[0].hostId).toBe(LOCAL_DEVICE_ID);
    expect(data.devices).toHaveLength(2);
  });

  /** 读写往返保持全部字段 */
  it('roundtrips entries through save and load', () => {
    const data = emptyRegistry();
    data.devices.push({
      hostId: 'remote-1',
      name: '工作室电脑',
      hostName: 'studio',
      address: 'https://studio.example.com',
      lastConnectedAt: 123,
    });
    data.currentHostId = 'remote-1';
    registry.save(data);

    expect(registry.load()).toEqual(data);
  });

  /** 原子写不在目录里留临时文件 */
  it('leaves no temp file after save', () => {
    registry.save(emptyRegistry());
    expect(fs.existsSync(`${filePath}.tmp`)).toBe(false);
    expect(fs.existsSync(filePath)).toBe(true);
  });
});
