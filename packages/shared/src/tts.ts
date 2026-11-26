/** TTS model definition */
export interface TtsModel {
  id: string;
  name: string;
}

/** Cloned voice entry stored in minimax-tts.json */
export interface ClonedVoice {
  voice_id: string;
  name: string;
}

/** Voice option returned by API (preset or cloned) */
export interface VoiceOption {
  id: string;
  name: string;
  gender: 'male' | 'female' | 'neutral';
  group: 'preset' | 'cloned';
}

/**
 * TTS config wire shape (GET/PUT /api/tts/config).
 *
 * `summaryThreshold` 来自 server 的 AppConfig.tts，路由响应时拼入。
 * Server 内部存储不含此字段——见 server tts/types.ts 的存储类型。
 */
export interface TtsConfig {
  apiKey: string;
  model: string;
  clonedVoices: ClonedVoice[];
  summaryThreshold: number;
}

/**
 * Speech language options of an Agent. value is stored in the field
 * voiceLanguage of the agent config. labelKey is the desktop i18n key of
 * the option name. boost is the MiniMax language_boost parameter and is
 * absent on default.
 */
export const VOICE_LANGUAGES = [
  { value: 'default', labelKey: 'agentEditor.langDefault', boost: undefined },
  { value: 'zh', labelKey: 'agentEditor.langZh', boost: 'Chinese' },
  { value: 'en', labelKey: 'agentEditor.langEn', boost: 'English' },
  { value: 'ja', labelKey: 'agentEditor.langJa', boost: 'Japanese' },
] as const;

/** Speech language value stored in the field voiceLanguage of the agent config. */
export type VoiceLanguageValue = (typeof VOICE_LANGUAGES)[number]['value'];

/**
 * Map a speech language value to the MiniMax language_boost parameter.
 * @param voiceLanguage - Value of the field voiceLanguage of the agent config
 * @returns language_boost value, or undefined when the language needs none
 */
export function getLanguageBoost(voiceLanguage?: string): string | undefined {
  return VOICE_LANGUAGES.find((l) => l.value === voiceLanguage)?.boost;
}
