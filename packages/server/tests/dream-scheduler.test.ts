/**
 * @fileoverview dream-scheduler 的 shouldDream 纯函数单测。
 */

import { describe, it, expect } from 'bun:test';
import { shouldDream } from '../src/server/dream-scheduler.js';

const cfg = (minutes: number) => ({ dreamIntervalMinutes: minutes });
const MIN = 60 * 1000;

describe('shouldDream', () => {
  it('无未处理料时为 false（no-op）', () => {
    expect(shouldDream(cfg(120), 0, 6000 * MIN, 0)).toBe(false);
  });

  it('未处理条目数 ≥ 50 时无视间隔为 true（安全触发）', () => {
    // 距上次仅 60 分钟、间隔 1440 分钟，但因积压 50 条立即触发
    expect(shouldDream(cfg(1440), 6000 * MIN, 6060 * MIN, 50)).toBe(true);
  });

  it('到间隔且有未处理料时为 true（边界含等号）', () => {
    // 间隔 120 分钟，距上次恰好 120 分钟
    expect(shouldDream(cfg(120), 6000 * MIN, 6120 * MIN, 5)).toBe(true);
  });

  it('未到间隔但有未处理料时为 false', () => {
    // 间隔 120 分钟，距上次仅 60 分钟
    expect(shouldDream(cfg(120), 6000 * MIN, 6060 * MIN, 5)).toBe(false);
  });

  it('从未整理过（last=0）且有未处理料时为 true（重启补跑）', () => {
    // 真实时间戳足够大，now - 0 必然 ≥ 间隔
    const now = 1_700_000_000_000;
    expect(shouldDream(cfg(120), 0, now, 5)).toBe(true);
  });
});
