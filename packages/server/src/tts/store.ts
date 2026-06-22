/**
 * @fileoverview Read/write minimax-tts.json config file.
 */

import * as fs from 'node:fs';
import * as yaml from 'yaml';
import { getTtsConfigPath, getConfigPath } from '../util/paths.js';
import { readJsonFile } from '../util/fs-helpers.js';
import type { TtsConfig } from './types.js';
import { TTS_MODELS } from './types.js';

const DEFAULT_TTS_CONFIG: TtsConfig = {
  apiKey: '',
  model: 'speech-2.8-hd',
  clonedVoices: [],
  summaryThreshold: 200,
};

const VALID_MODEL_IDS = new Set(TTS_MODELS.map((m) => m.id));

/**
 * 一次性迁移：从旧版 config.yaml 读取 summaryThreshold。
 * summaryThreshold 原存于 config.yaml 的 tts 段，现已搬到 minimax-tts.json。
 * @returns 旧值；config.yaml 无 tts 段时返回 undefined
 */
function readLegacySummaryThreshold(): number | undefined {
  try {
    const content = fs.readFileSync(getConfigPath(), 'utf-8');
    const parsed = yaml.parse(content) as {
      tts?: { summaryThreshold?: number };
    };
    return parsed.tts?.summaryThreshold;
  } catch {
    return undefined;
  }
}

/**
 * Load TTS config from minimax-tts.json. Returns defaults for missing fields.
 * 若 json 中无 summaryThreshold，自动从旧版 config.yaml 迁移并持久化（一次性、幂等）。
 */
export function loadTtsConfig(): TtsConfig {
  const configPath = getTtsConfigPath();
  const parsed = readJsonFile<Partial<TtsConfig>>(configPath, {});
  const model = parsed.model ?? DEFAULT_TTS_CONFIG.model;

  let summaryThreshold = parsed.summaryThreshold;
  if (summaryThreshold === undefined) {
    summaryThreshold =
      readLegacySummaryThreshold() ?? DEFAULT_TTS_CONFIG.summaryThreshold;
    // 持久化迁移结果到 minimax-tts.json
    saveTtsConfig({
      apiKey: parsed.apiKey ?? DEFAULT_TTS_CONFIG.apiKey,
      model: VALID_MODEL_IDS.has(model) ? model : DEFAULT_TTS_CONFIG.model,
      clonedVoices: parsed.clonedVoices ?? DEFAULT_TTS_CONFIG.clonedVoices,
      summaryThreshold,
    });
  }

  return {
    apiKey: parsed.apiKey ?? DEFAULT_TTS_CONFIG.apiKey,
    model: VALID_MODEL_IDS.has(model) ? model : DEFAULT_TTS_CONFIG.model,
    clonedVoices: parsed.clonedVoices ?? DEFAULT_TTS_CONFIG.clonedVoices,
    summaryThreshold,
  };
}

/** Save TTS config to minimax-tts.json. */
export function saveTtsConfig(config: TtsConfig): void {
  const configPath = getTtsConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
