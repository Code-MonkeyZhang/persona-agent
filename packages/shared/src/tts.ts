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
