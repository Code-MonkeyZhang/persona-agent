/**
 * @fileoverview 音色分组纯函数测试：下拉的分组顺序、克隆与中性音色的归属、空组处理
 */

import { describe, it, expect } from 'vitest';
import { groupVoices, type VoiceOption } from '@persona/shared';

/** 按给定属性造一个音色，名称与 id 相同 */
const voiceOf = (
  id: string,
  group: VoiceOption['group'],
  gender: VoiceOption['gender']
): VoiceOption => ({ id, name: id, gender, group });

/** 取分组结果的 key 序列 */
const keysOf = (voices: VoiceOption[]) => groupVoices(voices).map((g) => g.key);

/** 取某个分组内的音色 id 序列，分组不存在时为 undefined */
const idsIn = (voices: VoiceOption[], key: string) =>
  groupVoices(voices)
    .find((g) => g.key === key)
    ?.items.map((v) => v.id);

describe('groupVoices', () => {
  /** 测试分组顺序固定为克隆、女声、男声、其他，与传入顺序无关 */
  it('should order the groups cloned, female, male, other', () => {
    const voices = [
      voiceOf('m1', 'preset', 'male'),
      voiceOf('o1', 'preset', 'neutral'),
      voiceOf('f1', 'preset', 'female'),
      voiceOf('c1', 'cloned', 'neutral'),
    ];
    expect(keysOf(voices)).toEqual(['cloned', 'female', 'male', 'other']);
    expect(idsIn(voices, 'female')).toEqual(['f1']);
    expect(idsIn(voices, 'male')).toEqual(['m1']);
  });

  /** 测试克隆音色的性别同样是中性，但它只归克隆组，不混进其他组 */
  it('should keep cloned voices out of the other group', () => {
    const voices = [
      voiceOf('c1', 'cloned', 'neutral'),
      voiceOf('o1', 'preset', 'neutral'),
    ];
    expect(idsIn(voices, 'other')).toEqual(['o1']);
    expect(idsIn(voices, 'cloned')).toEqual(['c1']);
  });

  /** 测试没有音色的组不输出，空清单得到空结果 */
  it('should leave out empty groups', () => {
    expect(keysOf([voiceOf('f1', 'preset', 'female')])).toEqual(['female']);
    expect(groupVoices([])).toEqual([]);
  });

  /** 测试组内保持传入顺序，入参不被改动 */
  it('should keep the given order inside a group', () => {
    const voices = [
      voiceOf('f2', 'preset', 'female'),
      voiceOf('f1', 'preset', 'female'),
    ];
    expect(idsIn(voices, 'female')).toEqual(['f2', 'f1']);
    expect(voices.map((v) => v.id)).toEqual(['f2', 'f1']);
  });
});
