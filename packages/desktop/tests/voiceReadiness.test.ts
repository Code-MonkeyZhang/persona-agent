/**
 * @file tests/voiceReadiness.test.ts
 * @description 语音能力判定纯函数的用例，覆盖缺口枚举顺序、reason 映射、文案映射与边沿触发
 */
import { describe, expect, it } from 'vitest';
import {
  listMissing,
  missingToI18nKey,
  reasonToMissing,
  shouldNotifyOnDowngrade,
} from '@/lib/voice-readiness';

describe('listMissing', () => {
  it('双缺时 Key 排在音色前，决定提醒弹出顺序', () => {
    expect(listMissing({ hasKey: false, hasVoice: false })).toEqual([
      'apiKey',
      'voiceId',
    ]);
  });

  it('能力齐备时无缺口', () => {
    expect(listMissing({ hasKey: true, hasVoice: true })).toEqual([]);
  });

  it('只缺其中一样时单项返回', () => {
    expect(listMissing({ hasKey: true, hasVoice: false })).toEqual(['voiceId']);
    expect(listMissing({ hasKey: false, hasVoice: true })).toEqual(['apiKey']);
  });
});

describe('reasonToMissing', () => {
  it('no_api_key 映射 Key 缺口', () => {
    expect(reasonToMissing('no_api_key')).toBe('apiKey');
  });

  it('未配音色与音色被删都映射音色缺口', () => {
    expect(reasonToMissing('no_voice_id')).toBe('voiceId');
    expect(reasonToMissing('voice_not_found')).toBe('voiceId');
  });

  it('no_content 返回 null，不经能力链路处理', () => {
    expect(reasonToMissing('no_content')).toBeNull();
  });
});

describe('missingToI18nKey', () => {
  it('缺口映射到对应引导文案 key', () => {
    expect(missingToI18nKey('apiKey')).toBe('voice.onButNoKey');
    expect(missingToI18nKey('voiceId')).toBe('voice.onButNoVoice');
  });
});

describe('shouldNotifyOnDowngrade', () => {
  it('只在就绪跌缺失那一次为真', () => {
    expect(shouldNotifyOnDowngrade(true, false)).toBe(true);
    expect(shouldNotifyOnDowngrade(false, false)).toBe(false);
    expect(shouldNotifyOnDowngrade(null, false)).toBe(false);
    expect(shouldNotifyOnDowngrade(false, true)).toBe(false);
  });
});
