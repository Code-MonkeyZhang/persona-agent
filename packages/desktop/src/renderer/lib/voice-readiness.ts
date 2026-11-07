/**
 * @file lib/voice-readiness.ts
 * @description 语音能力缺口与 speak_error reason 的纯判定，不依赖 React 与网络，供 voiceStore 复用
 */

import type { SpeakErrorReason } from '@persona/shared';

/** 语音能力缺口，Key 在前音色在后，双缺时提醒按此顺序弹出 */
export type VoiceMissing = 'apiKey' | 'voiceId';

/** 能力输入，Key 与音色两样齐备才算语音可用 */
export interface VoiceCapabilityInput {
  hasKey: boolean;
  hasVoice: boolean;
}

/** 缺口到 i18n key 的映射，点击引导与运行时降级共用同一份文案 */
const MISSING_I18N_KEYS: Record<VoiceMissing, string> = {
  apiKey: 'voice.onButNoKey',
  voiceId: 'voice.onButNoVoice',
};

/** reason 到缺口的映射，音色被删与未配音色同指音色缺口 */
const REASON_TO_MISSING: Partial<Record<SpeakErrorReason, VoiceMissing>> = {
  no_api_key: 'apiKey',
  no_voice_id: 'voiceId',
  voice_not_found: 'voiceId',
};

/**
 * 枚举能力缺口，Key 永远排在音色前。
 */
export function listMissing(input: VoiceCapabilityInput): VoiceMissing[] {
  const missing: VoiceMissing[] = [];
  if (!input.hasKey) missing.push('apiKey');
  if (!input.hasVoice) missing.push('voiceId');
  return missing;
}

/**
 * 缺口换引导文案 key。
 */
export function missingToI18nKey(missing: VoiceMissing): string {
  return MISSING_I18N_KEYS[missing];
}

/**
 * speak_error reason 换能力缺口，no_content 与未知 reason 返回 null 表示不经能力链路处理。
 */
export function reasonToMissing(reason: SpeakErrorReason): VoiceMissing | null {
  return REASON_TO_MISSING[reason] ?? null;
}

/**
 * 降级提醒的边沿判定，只在能力从齐备跌到缺失那一次为真，持续缺失不重复提醒。
 */
export function shouldNotifyOnDowngrade(
  prev: boolean | null,
  next: boolean
): boolean {
  return prev === true && next === false;
}
