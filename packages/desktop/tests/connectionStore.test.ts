/**
 * @fileoverview 当前设备解析测试：本机归位、远程解析与快照未就绪兜底。
 */
import { describe, it, expect } from 'vitest';
import { currentDeviceOf } from '@/stores/connectionStore';
import type { ConnectionSnapshot, DeviceEntry } from '@shared/api';

/** 造一份连接快照，current 与 local 各指向一台主机 */
function snap(currentHost: string, localHost: string): ConnectionSnapshot {
  return {
    current: {
      hostId: currentHost,
      address: 'http://192.168.1.9:8787',
      status: 'connected',
    },
    local: {
      hostId: localHost,
      address: 'http://127.0.0.1:8787',
      status: 'connected',
    },
  };
}

/** 造一条设备清单条目 */
function entry(hostId: string, name: string | null): DeviceEntry {
  return {
    hostId,
    name,
    hostName: `${hostId}-host`,
    address: null,
    lastConnectedAt: null,
  };
}

describe('currentDeviceOf', () => {
  /** 快照未就绪时视为本机，闸门默认放行 */
  it('should treat missing snapshot as local with no entry', () => {
    expect(currentDeviceOf([], null)).toEqual({ entry: null, remote: false });
  });

  /** 本机连接归位为 local 条目 */
  it('should resolve local connection back to the local entry', () => {
    const devices = [entry('local', '我的电脑'), entry('h-remote', null)];
    const result = currentDeviceOf(devices, snap('h-local', 'h-local'));
    expect(result.remote).toBe(false);
    expect(result.entry?.hostId).toBe('local');
  });

  /** 远程连接解析到对应条目并立起 remote 标志 */
  it('should resolve remote connection to its entry and flag remote', () => {
    const devices = [entry('local', null), entry('h-remote', '办公室主机')];
    const result = currentDeviceOf(devices, snap('h-remote', 'h-local'));
    expect(result.remote).toBe(true);
    expect(result.entry?.name).toBe('办公室主机');
  });

  /** 清单缺条目不吞掉 remote 标志，孤标签不渲染即可 */
  it('should keep remote flag when the entry is missing from the list', () => {
    expect(currentDeviceOf([], snap('h-remote', 'h-local'))).toEqual({
      entry: null,
      remote: true,
    });
  });
});
