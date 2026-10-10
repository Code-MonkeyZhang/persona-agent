/**
 * @fileoverview 连接横条形态推导测试：五形态、档位优先级与防重播规则。
 */
import { describe, it, expect } from 'vitest';
import { deriveConnStrip, shouldFlash } from '@/lib/connection-strip';

describe('deriveConnStrip', () => {
  /** 连接与重连的窗口期取 busy 蓝档并携带状态词来源 */
  it('should map connecting and reconnecting to busy with source', () => {
    expect(deriveConnStrip('connecting', 'idle', false)).toEqual({
      visible: true,
      kind: 'busy',
      busySource: 'connecting',
    });
    expect(deriveConnStrip('reconnecting', 'idle', false)).toEqual({
      visible: true,
      kind: 'busy',
      busySource: 'reconnecting',
    });
  });

  /** 连接已立时追平取 syncing 蓝档 */
  it('should map syncing to busy when connection is settled', () => {
    expect(deriveConnStrip('connected', 'syncing', false)).toEqual({
      visible: true,
      kind: 'busy',
      busySource: 'syncing',
    });
  });

  /** 断开取红档，红档压过绿闪 */
  it('should map disconnected to bad and let it win over flash', () => {
    expect(deriveConnStrip('disconnected', 'idle', true)).toEqual({
      visible: true,
      kind: 'bad',
      busySource: null,
    });
  });

  /** 空闲且无绿闪时整条不可见 */
  it('should stay hidden when idle without flash', () => {
    expect(deriveConnStrip('connected', 'idle', false).visible).toBe(false);
  });

  /** 绿闪在没有红蓝时把横条顶成 ok 档 */
  it('should show ok via flash flag only', () => {
    expect(deriveConnStrip('connected', 'idle', true)).toEqual({
      visible: true,
      kind: 'ok',
      busySource: null,
    });
  });
});

describe('shouldFlash', () => {
  /** 只认连接中到在线的跃迁 */
  it('should flash when connecting or reconnecting reaches connected', () => {
    expect(shouldFlash('connecting', 'connected')).toBe(true);
    expect(shouldFlash('reconnecting', 'connected')).toBe(true);
  });

  /** 挂载即在线不重播绿闪 */
  it('should not replay when mounting already connected', () => {
    expect(shouldFlash('connected', 'connected')).toBe(false);
  });

  /** 其他方向的跃迁都不亮 */
  it('should stay dark for other transitions', () => {
    expect(shouldFlash('disconnected', 'connected')).toBe(false);
    expect(shouldFlash('connected', 'disconnected')).toBe(false);
    expect(shouldFlash('disconnected', 'connecting')).toBe(false);
  });
});
