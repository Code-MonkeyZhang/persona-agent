/**
 * @fileoverview 容量归档纯函数测试：精确容量就近落到档位
 */

import { describe, it, expect } from 'vitest';
import { tierOf } from '@/lib/contextTiers';

describe('tierOf', () => {
  /** 测试档位表上的精确值返回对应档位 */
  it('should return the tier for an exact tier value', () => {
    expect(tierOf(8192)).toBe('8K');
    expect(tierOf(204800)).toBe('200K');
    expect(tierOf(1048576)).toBe('1M');
  });

  /** 测试档位之间的值就近归档 */
  it('should snap to the nearest tier', () => {
    expect(tierOf(128000)).toBe('128K');
    expect(tierOf(100000)).toBe('128K');
    expect(tierOf(1047576)).toBe('1M');
  });

  /** 测试档位表两端的值收敛到端点档位 */
  it('should clamp to the edge tiers', () => {
    expect(tierOf(1)).toBe('4K');
    expect(tierOf(99999999)).toBe('2M');
  });
});
