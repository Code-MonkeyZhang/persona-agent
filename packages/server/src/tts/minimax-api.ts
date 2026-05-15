/**
 * @fileoverview MiniMax API wrapper for voice clone operations.
 *
 * Provides four functions: uploadAudio, cloneVoice, verifyVoice, deleteVoice.
 * All functions read apiKey from store.ts at call time.
 */

import { loadTtsConfig } from './store.js';

const BASE_URL = 'https://api.minimaxi.com';

/** Build authorization headers. apiKey is read from config each call. */
function authHeaders(): Record<string, string> {
  const { apiKey } = loadTtsConfig();
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Upload an audio file to MiniMax for voice cloning.
 * @returns file_id assigned by MiniMax
 */
export async function uploadAudio(
  fileBuffer: Buffer,
  filename: string
): Promise<number> {
  const { apiKey } = loadTtsConfig();

  const formData = new FormData();
  formData.append('purpose', 'voice_clone');
  formData.append('file', new Blob([fileBuffer]), filename);

  const resp = await fetch(`${BASE_URL}/v1/files/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  const data = (await resp.json()) as {
    base_resp: { status_code: number; status_msg?: string };
    file: { file_id: number };
  };

  if (data.base_resp.status_code !== 0) {
    throw new Error(
      `MiniMax upload failed: ${data.base_resp.status_msg ?? JSON.stringify(data)}`
    );
  }

  return data.file.file_id;
}

/**
 * Clone a voice using an uploaded audio file.
 * @param fileId - file_id returned by uploadAudio
 * @param voiceId - user-defined voice ID (alpha prefix, 8-256 chars)
 */
export async function cloneVoice(
  fileId: number,
  voiceId: string
): Promise<void> {
  const resp = await fetch(`${BASE_URL}/v1/voice_clone`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      file_id: fileId,
      voice_id: voiceId,
      model: 'speech-2.8-hd',
    }),
  });

  const data = (await resp.json()) as {
    base_resp: { status_code: number; status_msg?: string };
  };

  if (data.base_resp.status_code !== 0) {
    throw new Error(
      `MiniMax clone failed: ${data.base_resp.status_msg ?? JSON.stringify(data)}`
    );
  }
}

/**
 * Verify a cloned voice by synthesizing a short text.
 * Uses speech-2.8-turbo model. Only checks success/failure,
 * does not return audio data.
 */
export async function verifyVoice(voiceId: string): Promise<void> {
  const resp = await fetch(`${BASE_URL}/v1/t2a_v2`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({
      model: 'speech-2.8-turbo',
      text: '你好',
      stream: false,
      voice_setting: { voice_id: voiceId, speed: 1, vol: 1, pitch: 0 },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1,
      },
    }),
  });

  const data = (await resp.json()) as {
    base_resp: { status_code: number; status_msg?: string };
  };

  if (data.base_resp.status_code !== 0) {
    throw new Error(
      `Voice verification failed: ${data.base_resp.status_msg ?? JSON.stringify(data)}`
    );
  }
}

/**
 * Delete a cloned voice from MiniMax.
 */
export async function deleteVoice(voiceId: string): Promise<void> {
  const resp = await fetch(`${BASE_URL}/v1/delete_voice`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify({ voice_id: voiceId }),
  });

  const data = (await resp.json()) as {
    base_resp: { status_code: number; status_msg?: string };
  };

  if (data.base_resp.status_code !== 0) {
    throw new Error(
      `MiniMax delete failed: ${data.base_resp.status_msg ?? JSON.stringify(data)}`
    );
  }
}
