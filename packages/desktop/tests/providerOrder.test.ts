/**
 * @fileoverview 供应商排序纯函数测试：模型选择器的 orderForSelector 与供应商面板的 orderProviders
 */

import { describe, it, expect } from 'vitest';
import {
  orderProviders,
  orderForSelector,
  type OrderableProvider,
} from '@/lib/providerOrder';

/** 按给定 id 造一组供应商，名称与 id 相同 */
const providersOf = (...ids: string[]): OrderableProvider[] =>
  ids.map((id) => ({ id, name: id }));

/** 取排序结果里的 id 序列 */
const idsOf = (providers: OrderableProvider[]) => providers.map((p) => p.id);

describe('orderForSelector', () => {
  /** 测试没有位次输入时保持传入的配置顺序 */
  it('should keep the given order when no head is given', () => {
    expect(
      idsOf(orderForSelector(providersOf('zai', 'deepseek', 'openai')))
    ).toEqual(['zai', 'deepseek', 'openai']);
  });

  /** 测试当前在用、Agent 默认、上次使用依次置顶，其余保持配置顺序 */
  it('should move current, agent default and last used to the front in order', () => {
    const result = orderForSelector(
      providersOf('zai', 'deepseek', 'openai', 'kimi-coding'),
      'openai',
      'kimi-coding',
      'zai'
    );
    expect(idsOf(result)).toEqual(['openai', 'kimi-coding', 'zai', 'deepseek']);
  });

  /** 测试同一家落在几个位次时只出现一次 */
  it('should list a provider once when it fills several heads', () => {
    const result = orderForSelector(
      providersOf('zai', 'deepseek'),
      'deepseek',
      'deepseek',
      undefined
    );
    expect(idsOf(result)).toEqual(['deepseek', 'zai']);
  });

  /** 测试位次上的供应商不在已配置清单里时跳过 */
  it('should skip heads missing from the configured list', () => {
    const result = orderForSelector(
      providersOf('zai', 'deepseek'),
      'anthropic',
      undefined,
      'kimi-coding'
    );
    expect(idsOf(result)).toEqual(['zai', 'deepseek']);
  });

  /** 测试排序不改动入参 */
  it('should not mutate the input', () => {
    const input = providersOf('zai', 'deepseek');
    orderForSelector(input, 'deepseek');
    expect(idsOf(input)).toEqual(['zai', 'deepseek']);
  });
});

describe('orderProviders', () => {
  /** 测试选中的排最前，其余已配置的整组置顶，剩下按名称字母序 */
  it('should put the selected first, then configured ones, then the rest', () => {
    const result = orderProviders(
      providersOf('zai', 'deepseek', 'openai', 'kimi-coding'),
      'openai',
      new Set(['zai', 'openai'])
    );
    expect(idsOf(result)).toEqual(['openai', 'zai', 'deepseek', 'kimi-coding']);
  });
});
