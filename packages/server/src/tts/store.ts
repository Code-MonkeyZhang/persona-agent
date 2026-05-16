/**
 * @fileoverview Read/write minimax-tts.json config file.
 */

import * as fs from 'node:fs';
import { getTtsConfigPath } from '../util/paths.js';
import type { TtsConfig } from './types.js';

const DEFAULT_TTS_CONFIG: TtsConfig = {
  apiKey: '',
  model: 'speech-2.8-hd',
  clonedVoices: [],
};

/** Load TTS config from minimax-tts.json. Returns defaults for missing fields. */
export function loadTtsConfig(): TtsConfig {
  const configPath = getTtsConfigPath();
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_TTS_CONFIG };
  }
  const raw = fs.readFileSync(configPath, 'utf-8');
  const parsed = JSON.parse(raw) as Partial<TtsConfig>;
  return {
    apiKey: parsed.apiKey ?? DEFAULT_TTS_CONFIG.apiKey,
    model: parsed.model ?? DEFAULT_TTS_CONFIG.model,
    clonedVoices: parsed.clonedVoices ?? DEFAULT_TTS_CONFIG.clonedVoices,
  };
}

/** Save TTS config to minimax-tts.json. */
export function saveTtsConfig(config: TtsConfig): void {
  const configPath = getTtsConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
