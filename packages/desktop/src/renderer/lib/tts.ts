/**
 * @file lib/tts.ts
 * @description 语音播放的主要逻辑, MiniMax TTS API 封装，通过 Electron proxyFetch 调用语音合成接口
 */

import { logger } from './logger';

export { PRESET_VOICES, type VoiceOption } from './voices';

const TTS_API_URL = 'https://api.minimaxi.com/v1/t2a_v2';
const TTS_MODEL = 'speech-2.8-hd';

/**
 * 将 MiniMax 返回的 hex 编码音频解码为 ArrayBuffer
 * @param hex - hex 编码的音频字符串
 * @returns 解码后的音频 ArrayBuffer
 */
function hexToArrayBuffer(hex: string): ArrayBuffer {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes.buffer;
}

/**
 * 调用 MiniMax TTS 将文本合成为音频的主要函数
 * @param text - 要合成的文本（不超过 10000 字符）
 * @param voiceId - 音色 ID
 * @param apiKey - MiniMax API Key
 * @returns MP3 格式的音频 ArrayBuffer
 */
export async function synthesize(
  text: string,
  voiceId: string,
  apiKey: string
): Promise<ArrayBuffer> {
  // 构造请求体：使用 speech-2.8-hd 模型，非流式一次性返回完整音频
  const body = JSON.stringify({
    model: TTS_MODEL,
    text,
    stream: false,
    voice_setting: {
      voice_id: voiceId,
      speed: 1,
      vol: 1,
      pitch: 0,
    },
    audio_setting: {
      sample_rate: 32000,
      format: 'mp3',
    },
  });

  logger.info('[TTS] Request:', JSON.stringify(JSON.parse(body), null, 2));

  // 通过 Electron 主进程代理发起请求，避免浏览器 CORS 限制
  let resp: {
    ok: boolean;
    status: number;
    headers: Record<string, string>;
    body: ArrayBuffer;
  };
  try {
    resp = await window.api!.proxyFetch(TTS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body,
    });
  } catch (err) {
    logger.error(
      '[TTS] proxyFetch network error:',
      err instanceof Error ? err.message : String(err)
    );
    throw new Error(
      `TTS 网络请求失败: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 将响应体从 ArrayBuffer 解码为 JSON 文本
  const jsonText = new TextDecoder().decode(resp.body);
  logger.info(
    '[TTS] Response status:',
    resp.status,
    'body length:',
    jsonText.length
  );

  // 网络层 HTTP 错误处理
  if (!resp.ok) {
    logger.error(
      '[TTS] API HTTP error, status:',
      resp.status,
      'body:',
      jsonText.substring(0, 500)
    );
    throw new Error(
      `TTS API request failed: ${resp.status} - ${jsonText.substring(0, 200)}`
    );
  }

  // 解析 JSON，MiniMax 同步接口返回 { base_resp, data: { audio } } 结构
  let data: {
    base_resp: { status_code: number; status_msg: string };
    data: { audio: string };
  };
  try {
    data = JSON.parse(jsonText);
  } catch {
    logger.error(
      '[TTS] JSON parse failed, raw body:',
      jsonText.substring(0, 500)
    );
    throw new Error('TTS API 返回了非法的 JSON');
  }

  // 业务层错误：status_code 非 0 表示合成失败
  if (data.base_resp.status_code !== 0) {
    logger.error(
      '[TTS] API business error:',
      data.base_resp.status_msg,
      '(code:',
      data.base_resp.status_code,
      ')'
    );
    throw new Error(
      `TTS API error: ${data.base_resp.status_msg} (code: ${data.base_resp.status_code})`
    );
  }

  // MiniMax 返回的音频为 hex 编码字符串，解码为 ArrayBuffer 返回
  return hexToArrayBuffer(data.data.audio);
}
