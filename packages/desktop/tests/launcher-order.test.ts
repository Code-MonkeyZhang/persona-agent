/**
 * @fileoverview 小手机排列纯函数测试：清单对账与拖放落位。
 */

import { describe, it, expect } from 'vitest';
import { reconcileOrder, toGridItems, itemsToOrder } from '@persona/shared';

describe('reconcileOrder', () => {
  /** 测试空存档按清单原序铺开 */
  it('should lay out manifest order for empty stored doc', () => {
    expect(reconcileOrder(null, ['a', 'b'], ['slot:settings'])).toEqual([
      'a',
      'b',
      'slot:settings',
    ]);
  });

  /** 测试失效条目清成空位，新应用填进第一个空位 */
  it('should nullify stale ids and backfill newcomers', () => {
    expect(reconcileOrder(['gone', null, 'a'], ['a', 'b'], [])).toEqual([
      'b',
      null,
      'a',
    ]);
  });

  /** 测试槽位永不清理，缺席时补进第一个空位 */
  it('should keep slots present and backfill missing ones', () => {
    expect(reconcileOrder(['a'], ['a'], ['slot:settings'])).toEqual([
      'a',
      'slot:settings',
    ]);
  });

  /** 测试末尾连续空位收掉，中间空位保留为拖放目标 */
  it('should trim trailing holes but keep middle ones', () => {
    expect(reconcileOrder(['a', null, null], ['a'], [])).toEqual(['a']);
    expect(reconcileOrder(['a', null, 'b'], ['a', 'b'], [])).toEqual([
      'a',
      null,
      'b',
    ]);
  });
});

describe('grid item bridge', () => {
  /** 测试空位按下标合成占位 id，占用位保留原 id */
  it('should synthesize placeholder ids for empty cells', () => {
    expect(toGridItems(['a', null, 'slot:settings'])).toEqual([
      { id: 'a' },
      { id: 'empty:1' },
      { id: 'slot:settings' },
    ]);
  });

  /** 测试占位 id 还原为 null，末尾连续空位收掉 */
  it('should strip placeholders back to slot order', () => {
    expect(
      itemsToOrder([
        { id: 'empty:1' },
        { id: 'a' },
        { id: 'empty:2' },
        { id: 'empty:3' },
      ])
    ).toEqual([null, 'a']);
  });

  /** 测试槽位数组经条目模型往返后还原 */
  it('should round trip a slot order through grid items', () => {
    const order = ['a', null, 'b', 'slot:settings'];
    expect(itemsToOrder(toGridItems(order))).toEqual(order);
  });
});
