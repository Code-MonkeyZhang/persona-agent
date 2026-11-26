/**
 * @file 语音试听样本测试，覆盖样本语言的选取与回落规则，以及朗读语言到语言增强参数的映射
 */
import { describe, it, expect } from 'vitest';
import { getLanguageBoost } from '@persona/shared';
import { pickPreviewSample } from '@/lib/voice-preview-samples';

const SAMPLES = {
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

/** 连续取样多次并返回出现过的全部样本句，用来确认随机抽取始终落在同一组内 */
function collectTexts(
  voiceLanguage: string | undefined,
  uiLanguage: string
): Set<string> {
  const texts = new Set<string>();
  for (let i = 0; i < 40; i++) {
    texts.add(pickPreviewSample(voiceLanguage, uiLanguage).text);
  }
  return texts;
}

describe('pickPreviewSample', () => {
  it('reads the samples of the chosen speech language', () => {
    (['zh', 'en', 'ja'] as const).forEach((voiceLanguage) => {
      const sample = pickPreviewSample(voiceLanguage, 'zh-CN');
      expect(sample.language).toBe(voiceLanguage);
      collectTexts(voiceLanguage, 'zh-CN').forEach((text) => {
        expect(SAMPLES[voiceLanguage]).toContain(text);
      });
    });
  });

  it('falls back to the interface language when speech language is default', () => {
    expect(pickPreviewSample('default', 'zh-CN').language).toBe('zh');
    expect(pickPreviewSample('default', 'en').language).toBe('en');
    expect(pickPreviewSample(undefined, 'en-US').language).toBe('en');
    expect(pickPreviewSample(undefined, 'zh-TW').language).toBe('zh');
  });

  it('falls back to Chinese when the interface language has no samples', () => {
    expect(pickPreviewSample('default', 'fr').language).toBe('zh');
    expect(pickPreviewSample('default', undefined).language).toBe('zh');
  });

  it('falls back to the interface language for an unknown speech language', () => {
    expect(pickPreviewSample('ko', 'en').language).toBe('en');
  });
});

describe('getLanguageBoost', () => {
  it('maps each speech language to the MiniMax language boost', () => {
    expect(getLanguageBoost('zh')).toBe('Chinese');
    expect(getLanguageBoost('en')).toBe('English');
    expect(getLanguageBoost('ja')).toBe('Japanese');
  });

  it('returns undefined when no boost applies', () => {
    expect(getLanguageBoost('default')).toBeUndefined();
    expect(getLanguageBoost(undefined)).toBeUndefined();
    expect(getLanguageBoost('ko')).toBeUndefined();
  });
});
