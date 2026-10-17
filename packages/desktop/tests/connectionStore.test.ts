/**
 * @fileoverview 当前设备解析与设备状态点测试：本机归位、远程解析、四态语义。
 */
import { describe, it, expect } from 'vitest';
import { currentDeviceOf, deviceStatus } from '@/stores/connectionStore';
import type {
  ConnectionSnapshot,
  DeviceEntry,
  HostConnection,
} from '@shared/api';

/** 造一份连接快照，current 与 local 各指向一台主机 */
function snap(currentHost: string, localHost: string): ConnectionSnapshot {
  return snapStates('connected', 'connected', currentHost, localHost);
}

/** 造一份可指定两侧连接状态的快照 */
function snapStates(
  currentStatus: HostConnection['status'],
  localStatus: HostConnection['status'],
  currentHost = 'h-remote',
  localHost = 'h-local'
): ConnectionSnapshot {
  return {
    current: {
      hostId: currentHost,
      address: 'http://192.168.1.9:8787',
      status: currentStatus,
    },
    local: {
      hostId: localHost,
      address: 'http://127.0.0.1:8787',
      status: localStatus,
    },
  };
}

/** 造一条设备清单条目 */
function entry(
  hostId: string,
  name: string | null,
  address: string | null = null
): DeviceEntry {
  return {
    hostId,
    name,
    hostName: `${hostId}-host`,
    address,
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

describe('deviceStatus', () => {
  /** 本机条目跟随本机服务进程状态，不再写死在线 */
  it('should follow the local server state for the local entry', () => {
    const local = entry('local', null);
    expect(
      deviceStatus(local, snapStates('connected', 'connected'), {}, null)
    ).toBe('online');
    expect(
      deviceStatus(local, snapStates('connected', 'connecting'), {}, null)
    ).toBe('connecting');
    expect(
      deviceStatus(local, snapStates('connected', 'disconnected'), {}, null)
    ).toBe('offline');
  });

  /** 快照未就绪时本机也算不知道 */
  it('should treat the local entry as unknown before the snapshot arrives', () => {
    expect(deviceStatus(entry('local', null), null, {}, null)).toBe('unknown');
  });

  /** 当前主机跟随实时通道，中途断开立刻转红，重连中保持黄闪 */
  it('should follow the live link for the current host', () => {
    const remote = entry('h-remote', null, 'http://192.168.1.9:8787');
    const shot = snapStates('connected', 'connected');
    expect(deviceStatus(remote, shot, {}, 'connected')).toBe('online');
    expect(deviceStatus(remote, shot, {}, 'connecting')).toBe('connecting');
    expect(deviceStatus(remote, shot, {}, 'reconnecting')).toBe('connecting');
    expect(deviceStatus(remote, shot, {}, 'disconnected')).toBe('offline');
  });

  /** 实时通道未上报时回落到快照的连接状态 */
  it('should fall back to the snapshot when the link has not reported', () => {
    const remote = entry('h-remote', null, 'http://192.168.1.9:8787');
    expect(
      deviceStatus(remote, snapStates('connected', 'connected'), {}, null)
    ).toBe('online');
  });

  /** 其余设备看探测结论，没查过或没有地址都算不知道 */
  it('should resolve other devices from probe results', () => {
    const other = entry('h-other', null, 'http://192.168.1.20:8787');
    const shot = snapStates('connected', 'connected');
    expect(deviceStatus(other, shot, { 'h-other': true }, null)).toBe('online');
    expect(deviceStatus(other, shot, { 'h-other': false }, null)).toBe(
      'offline'
    );
    expect(deviceStatus(other, shot, {}, null)).toBe('unknown');
    expect(deviceStatus(entry('h-other', null, null), shot, {}, null)).toBe(
      'unknown'
    );
  });
});
