/**
 * @file 载入次序护栏的纯函数测试，票据递增、最新票放行、过期票丢弃与实例独立在此锁定
 */
import { describe, expect, it } from 'vitest';
import { LoadGuard } from '@/lib/loadGuard';

describe('LoadGuard', () => {
  it('issues increasing tickets per begin', () => {
    const guard = new LoadGuard();
    const first = guard.begin();
    const second = guard.begin();
    expect(second).toBeGreaterThan(first);
  });

  it('lets the latest ticket pass', () => {
    const guard = new LoadGuard();
    const ticket = guard.begin();
    expect(guard.isCurrent(ticket)).toBe(true);
  });

  it('drops tickets older than the latest begin', () => {
    const guard = new LoadGuard();
    const stale = guard.begin();
    guard.begin();
    expect(guard.isCurrent(stale)).toBe(false);
  });

  it('keeps instances independent', () => {
    const a = new LoadGuard();
    const b = new LoadGuard();
    const ticketOfA = a.begin();
    b.begin();
    expect(a.isCurrent(ticketOfA)).toBe(true);
  });
});
