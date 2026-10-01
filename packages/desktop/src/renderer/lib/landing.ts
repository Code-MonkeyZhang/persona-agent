/**
 * @file src/renderer/lib/landing.ts
 * @description 首启引导向导的纯逻辑规则，供向导组件与 viewStore 共用
 */

import type { ModelConfig } from '@persona/shared';

/** 向导模式：首启由门控自动弹出，重放由设置页入口打开 */
export type LandingMode = 'first-run' | 'replay';

/**
 * 判断凭据是否可信，同时驱动 P1 继续按钮与完成时默认模型的携带。
 * 首启模式下退化为当次验证状态，与既有行为一致。
 */
export function isCredentialTrusted(
  keyVerified: boolean,
  mode: LandingMode,
  providerHasAuth: boolean | undefined
): boolean {
  return keyVerified || (mode === 'replay' && !!providerHasAuth);
}

/**
 * 计算进入供应商表单时的默认模型预填值。
 * 首启恒取该供应商列表第一项，重放优先取 Agent 现有默认模型。
 */
export function resolveModelPrefill(
  mode: LandingMode,
  providerId: string,
  models: string[],
  agentDefault: ModelConfig | null
): string {
  if (
    mode === 'replay' &&
    agentDefault &&
    agentDefault.provider === providerId &&
    models.includes(agentDefault.model)
  ) {
    return agentDefault.model;
  }
  return models[0] ?? '';
}
