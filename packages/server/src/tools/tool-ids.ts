/**
 * @fileoverview 工具条目 id 常量与分配解析的纯函数。
 *
 * id 常量的正身在 @persona/shared，desktop 的图标表与测试同样消费，
 * 这里收拢 server 侧的导出与派生集合，保持零依赖叶子形态，
 * 避免配置仓经 logger 引入工具桶形成装载环。
 */

import { BUILTIN_TOOLSET_IDS, POSE_TOOLSET_ID } from '@persona/shared';

export { BUILTIN_TOOLSET_IDS, POSE_TOOLSET_ID };

/** 内置 id 集合，分配解析与镜像计算的成员判断共用 */
export const BUILTIN_TOOLSET_ID_SET = new Set<string>(BUILTIN_TOOLSET_IDS);

/**
 * 解析 Agent 的有效工具分配。
 *
 * toolNames 存在直接用，缺失时内置五组全分配。
 * 内置关掉就是从数组里去掉，默认规则只活在服务端这一处，
 * 客户端一律消费现算结果。
 */
export function effectiveToolNames(config: { toolNames?: string[] }): string[] {
  if (config.toolNames) return config.toolNames;
  return [...BUILTIN_TOOLSET_IDS];
}
