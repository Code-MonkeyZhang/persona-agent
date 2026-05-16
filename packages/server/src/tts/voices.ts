/**
 * @fileoverview Voice management: list all voices and clone.
 *
 * Orchestrates minimax-api.ts and store.ts so route handlers stay thin.
 */

import { loadTtsConfig, saveTtsConfig } from './store.js';
import { uploadAudio, cloneVoice, verifyVoice } from './minimax-api.js';
import { PRESET_VOICES } from './types.js';
import type { VoiceOption, ClonedVoice } from './types.js';

/** Return preset + cloned voices, cloned first. */
export function getAllVoices(): VoiceOption[] {
  const { clonedVoices } = loadTtsConfig();

  const cloned: VoiceOption[] = clonedVoices.map((v: ClonedVoice) => ({
    id: v.voice_id,
    name: v.name,
    gender: 'neutral',
    group: 'cloned',
  }));

  return [...cloned, ...PRESET_VOICES];
}

/**
 * One-stop voice clone: upload → clone → verify → persist.
 * Writes to config only after all MiniMax calls succeed.
 */
export async function addClonedVoice(
  fileBuffer: Buffer,
  filename: string,
  voiceId: string,
  name: string
): Promise<void> {
  const fileId = await uploadAudio(fileBuffer, filename);
  await cloneVoice(fileId, voiceId);
  await verifyVoice(voiceId);

  const config = loadTtsConfig();
  config.clonedVoices.push({ voice_id: voiceId, name });
  saveTtsConfig(config);
}

/**
 * Remove a cloned voice from local config only.
 * Does NOT call MiniMax delete API to avoid the ¥9.9/clone cost.
 */
export async function removeClonedVoice(voiceId: string): Promise<void> {
  const config = loadTtsConfig();
  config.clonedVoices = config.clonedVoices.filter(
    (v) => v.voice_id !== voiceId
  );
  saveTtsConfig(config);
}
