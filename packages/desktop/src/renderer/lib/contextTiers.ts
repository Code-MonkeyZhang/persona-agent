/**
 * @file src/renderer/lib/contextTiers.ts
 * @description 容量归档，模型行第二行的容量徽章由这里把精确容量归成档位
 */

/** 容量档位表从小到大，端上归档只管徽章显示，精确值照常参与占用计算 */
const CONTEXT_TIERS: [number, string][] = [
  [4096, '4K'],
  [8192, '8K'],
  [16384, '16K'],
  [32768, '32K'],
  [40960, '40K'],
  [65536, '64K'],
  [131072, '128K'],
  [163840, '160K'],
  [204800, '200K'],
  [262144, '256K'],
  [278528, '272K'],
  [307200, '300K'],
  [327680, '320K'],
  [409600, '400K'],
  [524288, '512K'],
  [1048576, '1M'],
  [2097152, '2M'],
];

/**
 * 精确容量就近归档成档位，128000 与 131072 都显示 128K
 * @param ctx - 模型的上下文窗口精确值，单位 token
 * @returns 徽章上显示的档位文案
 */
export function tierOf(ctx: number): string {
  let best = CONTEXT_TIERS[0];
  for (const tier of CONTEXT_TIERS) {
    if (Math.abs(tier[0] - ctx) < Math.abs(best[0] - ctx)) best = tier;
  }
  return best[1];
}
