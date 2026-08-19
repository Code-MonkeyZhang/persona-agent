/**
 * @fileoverview TTS type definitions, constants, and preset voices.
 */

import type { ClonedVoice, TtsModel, VoiceOption } from '@persona/shared';

// 线上 DTO 已迁移至 @persona/shared
export type { TtsModel, ClonedVoice, VoiceOption } from '@persona/shared';

/**
 * TTS 配置，存储与线上传输共用同一形状。
 * summaryThreshold 原存于 config.yaml，现已搬迁至此。
 */
export interface TtsConfig {
  apiKey: string;
  model: string;
  clonedVoices: ClonedVoice[];
  summaryThreshold: number;
}

/** Voice language option for language_boost parameter */
interface VoiceLanguage {
  value: string;
  label: string;
  boost?: string;
}

/** TTS models supported by MiniMax (Speech 2.8 only — Token Plan compatible) */
export const TTS_MODELS: TtsModel[] = [
  { id: 'speech-2.8-hd', name: 'Speech 2.8 HD' },
  { id: 'speech-2.8-turbo', name: 'Speech 2.8 Turbo' },
];

/** Voice language options. boost maps to MiniMax language_boost parameter. */
const VOICE_LANGUAGES: VoiceLanguage[] = [
  { value: 'default', label: 'Default' },
  { value: 'zh', label: '中文', boost: 'Chinese' },
  { value: 'en', label: '英语', boost: 'English' },
  { value: 'ja', label: '日语', boost: 'Japanese' },
];

/**
 * 54 preset voices (Chinese Mandarin).
 * Source: https://platform.minimaxi.com/docs/faq/system-voice-id
 */
export const PRESET_VOICES: VoiceOption[] = [
  {
    id: 'male-qn-qingse',
    name: '青涩青年音色',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'male-qn-jingying',
    name: '精英青年音色',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'male-qn-badao',
    name: '霸道青年音色',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'male-qn-daxuesheng',
    name: '青年大学生音色',
    gender: 'male',
    group: 'preset',
  },
  { id: 'female-shaonv', name: '少女音色', gender: 'female', group: 'preset' },
  { id: 'female-yujie', name: '御姐音色', gender: 'female', group: 'preset' },
  {
    id: 'female-chengshu',
    name: '成熟女性音色',
    gender: 'female',
    group: 'preset',
  },
  {
    id: 'female-tianmei',
    name: '甜美女性音色',
    gender: 'female',
    group: 'preset',
  },
  {
    id: 'male-qn-qingse-jingpin',
    name: '青涩青年音色-beta',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'male-qn-jingying-jingpin',
    name: '精英青年音色-beta',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'male-qn-badao-jingpin',
    name: '霸道青年音色-beta',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'male-qn-daxuesheng-jingpin',
    name: '青年大学生音色-beta',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'female-shaonv-jingpin',
    name: '少女音色-beta',
    gender: 'female',
    group: 'preset',
  },
  {
    id: 'female-yujie-jingpin',
    name: '御姐音色-beta',
    gender: 'female',
    group: 'preset',
  },
  {
    id: 'female-chengshu-jingpin',
    name: '成熟女性音色-beta',
    gender: 'female',
    group: 'preset',
  },
  {
    id: 'female-tianmei-jingpin',
    name: '甜美女性音色-beta',
    gender: 'female',
    group: 'preset',
  },
  { id: 'clever_boy', name: '聪明男童', gender: 'male', group: 'preset' },
  { id: 'cute_boy', name: '可爱男童', gender: 'male', group: 'preset' },
  { id: 'lovely_girl', name: '萌萌女童', gender: 'female', group: 'preset' },
  { id: 'cartoon_pig', name: '卡通猪小琪', gender: 'neutral', group: 'preset' },
  { id: 'bingjiao_didi', name: '病娇弟弟', gender: 'male', group: 'preset' },
  { id: 'junlang_nanyou', name: '俊朗男友', gender: 'male', group: 'preset' },
  { id: 'chunzhen_xuedi', name: '纯真学弟', gender: 'male', group: 'preset' },
  {
    id: 'lengdan_xiongzhang',
    name: '冷淡学长',
    gender: 'male',
    group: 'preset',
  },
  { id: 'badao_shaoye', name: '霸道少爷', gender: 'male', group: 'preset' },
  {
    id: 'tianxin_xiaoling',
    name: '甜心小玲',
    gender: 'female',
    group: 'preset',
  },
  { id: 'qiaopi_mengmei', name: '俏皮萌妹', gender: 'female', group: 'preset' },
  { id: 'wumei_yujie', name: '妩媚御姐', gender: 'female', group: 'preset' },
  { id: 'diadia_xuemei', name: '嗲嗲学妹', gender: 'female', group: 'preset' },
  { id: 'danya_xuejie', name: '淡雅学姐', gender: 'female', group: 'preset' },
  {
    id: 'Chinese (Mandarin)_Reliable_Executive',
    name: '沉稳高管',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_News_Anchor',
    name: '新闻女声',
    gender: 'female',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Mature_Woman',
    name: '傲娇御姐',
    gender: 'female',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Unrestrained_Young_Man',
    name: '不羁青年',
    gender: 'male',
    group: 'preset',
  },
  { id: 'Arrogant_Miss', name: '嚣张小姐', gender: 'female', group: 'preset' },
  { id: 'Robot_Armor', name: '机械战甲', gender: 'neutral', group: 'preset' },
  {
    id: 'Chinese (Mandarin)_Kind-hearted_Antie',
    name: '热心大婶',
    gender: 'female',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_HK_Flight_Attendant',
    name: '港普空姐',
    gender: 'female',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Humorous_Elder',
    name: '搞笑大爷',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Gentleman',
    name: '温润男声',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Warm_Bestie',
    name: '温暖闺蜜',
    gender: 'female',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Male_Announcer',
    name: '播报男声',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Sweet_Lady',
    name: '甜美女声',
    gender: 'female',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Southern_Young_Man',
    name: '南方小哥',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Wise_Women',
    name: '阅历姐姐',
    gender: 'female',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Gentle_Youth',
    name: '温润青年',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Warm_Girl',
    name: '温暖少女',
    gender: 'female',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Kind-hearted_Elder',
    name: '花甲奶奶',
    gender: 'female',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Cute_Spirit',
    name: '憨憨萌兽',
    gender: 'neutral',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Radio_Host',
    name: '电台男主播',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Lyrical_Voice',
    name: '抒情男声',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Straightforward_Boy',
    name: '率真弟弟',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Sincere_Adult',
    name: '真诚青年',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Gentle_Senior',
    name: '温柔学姐',
    gender: 'female',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Stubborn_Friend',
    name: '嘴硬竹马',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Crisp_Girl',
    name: '清脆少女',
    gender: 'female',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Pure-hearted_Boy',
    name: '清澈邻家弟弟',
    gender: 'male',
    group: 'preset',
  },
  {
    id: 'Chinese (Mandarin)_Soft_Girl',
    name: '柔和少女',
    gender: 'female',
    group: 'preset',
  },
];

/** Map voiceLanguage value to MiniMax language_boost parameter. Returns undefined for default. */
export function getLanguageBoost(voiceLanguage?: string): string | undefined {
  if (!voiceLanguage || voiceLanguage === 'default') return undefined;
  const lang = VOICE_LANGUAGES.find((l) => l.value === voiceLanguage);
  return lang?.boost;
}
