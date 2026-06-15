/**
 * @fileoverview Read/write minimax-tts.json config file.
 */

import * as fs from 'node:fs';
import { getTtsConfigPath } from '../util/paths.js';
import { readJsonFile } from '../util/fs-helpers.js';
import type { TtsConfig } from './types.js';
import { TTS_MODELS } from './types.js';

const DEFAULT_TTS_CONFIG: TtsConfig = {
  apiKey: '',
  model: 'speech-2.8-hd',
  clonedVoices: [],
};

const VALID_MODEL_IDS = new Set(TTS_MODELS.map((m) => m.id));

/** Load TTS config from minimax-tts.json. Returns defaults for missing fields. */
export function loadTtsConfig(): TtsConfig {
  const configPath = getTtsConfigPath();
  const parsed = readJsonFile<Partial<TtsConfig>>(configPath, {});
  const model = parsed.model ?? DEFAULT_TTS_CONFIG.model;
  return {
    apiKey: parsed.apiKey ?? DEFAULT_TTS_CONFIG.apiKey,
    model: VALID_MODEL_IDS.has(model) ? model : DEFAULT_TTS_CONFIG.model,
    clonedVoices: parsed.clonedVoices ?? DEFAULT_TTS_CONFIG.clonedVoices,
  };
}

/** Save TTS config to minimax-tts.json. */
export function saveTtsConfig(config: TtsConfig): void {
  const configPath = getTtsConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
