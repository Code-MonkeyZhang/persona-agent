/**
 * @file src/renderer/lib/voice-preview-samples.ts
 * @description 语音试听样本，按朗读语言分组，朗读语言为 default 时回落界面语言
 */

import type { VoiceLanguageValue } from '@persona/shared';

/** 有试听样本的朗读语言，default 没有专属样本 */
type SampleLanguage = Exclude<VoiceLanguageValue, 'default'>;

/**
 * 试听样本。三组是同一份清单的三个译本，相同下标对应同一句
 */
const PREVIEW_SAMPLES: Record<SampleLanguage, readonly string[]> = {
  zh: [
    '网络是无限宽广的。',
    '有时候，想要爱一个人，你只能做一个陌生人。',
    '我从何而来？去往何方？我还能拥有多久？',
    '任何足够先进的技术，都与魔法无异。',
    '探寻可能性边界的唯一办法，就是冒险踏入不可能之中。',
    '或许我们在这颗星球的使命，不是崇拜神，而是创造神。',
    '当你承受苦难之时，才是你最真实的时刻。',
  ],
  en: [
    'The Net is vast and infinite.',
    'Sometimes to love someone, you gotta be a stranger.',
    'Where do I come from? Where am I going? How long have I got?',
    'Any sufficiently advanced technology is indistinguishable from magic.',
    'The only way of discovering the limits of the possible is to venture a little way past them into the impossible.',
    'It may be that our role on this planet is not to worship God but to create him.',
    "When you're suffering, that's when you're most real.",
  ],
  ja: [
    'ネットは広大だわ。',
    '時には、誰かを愛するために、他人にならなければならない。',
    '私はどこから来た？どこへ行く？残された時間は、あとどれだけ？',
    '十分に発達した科学技術は、魔法と見分けがつかない。',
    '可能の限界を発見する唯一の方法は、少しだけその先の不可能へ足を踏み入れることだ。',
    '我々がこの星で果たす役割は、神を崇めることではなく、神を創造することなのかもしれない。',
    '苦しんでいるときこそ、あなたの最も真実の瞬間だ。',
  ],
};

/**
 * 判断一个值是否为有试听样本的朗读语言
 * @param value - 待判断的朗读语言值
 * @returns 是有样本的朗读语言时为 true
 */
function isSampleLanguage(value: string | undefined): value is SampleLanguage {
  return value !== undefined && value in PREVIEW_SAMPLES;
}

/**
 * 把界面语言解析为样本语言，只比较主语言子标签，匹配不到时回落中文
 * @param uiLanguage - 当前界面语言，可能带地区码
 * @returns 界面语言对应的样本语言
 */
function toSampleLanguage(uiLanguage: string | undefined): SampleLanguage {
  const main = uiLanguage?.split('-')[0]?.toLowerCase();
  return main === 'en' || main === 'ja' ? main : 'zh';
}

/**
 * 取一句试听样本。朗读语言有专属样本时用该语言，default 与未知值回落界面语言
 * @param voiceLanguage - 朗读语言，即 Agent 配置的 voiceLanguage
 * @param uiLanguage - 当前界面语言
 * @returns language - 样本实际使用的语言
 * @returns text - 随机选中的样本句
 */
export function pickPreviewSample(
  voiceLanguage: string | undefined,
  uiLanguage: string | undefined
): { language: SampleLanguage; text: string } {
  const language = isSampleLanguage(voiceLanguage)
    ? voiceLanguage
    : toSampleLanguage(uiLanguage);
  const samples = PREVIEW_SAMPLES[language];
  return {
    language,
    text: samples[Math.floor(Math.random() * samples.length)],
  };
}
