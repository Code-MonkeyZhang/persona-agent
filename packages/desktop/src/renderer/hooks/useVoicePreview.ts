/**
 * @file src/renderer/hooks/useVoicePreview.ts
 * @description 语音试听 hook，封装 TTS 配置检查、合成、播放和状态管理
 */

import { useState } from 'react';
import { getTtsConfig } from '../lib/api';
import { synthesize } from '../lib/tts';
import { audioPlayer } from '../lib/audio-player';
import { toast } from '../stores/toastStore';
import { logger } from '../lib/logger';

interface PreviewLabels {
  /** API Key 未配置时的提示 */
  noKey: string;
  /** 合成失败时的提示 */
  failed: string;
}

/**
 * 语音试听 hook，管理试听状态并提供 preview 方法。
 * @returns playingId - 正在试听的音色 ID（null 表示空闲）
 * @returns preview - 试听指定音色
 */
export function useVoicePreview() {
  const [playingId, setPlayingId] = useState<string | null>(null);

  /**
   * 试听指定音色：检查 API Key → 合成 → 播放，3 秒后重置状态
   */
  const preview = async (
    voiceId: string,
    previewText: string,
    labels: PreviewLabels
  ) => {
    try {
      const config = await getTtsConfig();
      if (!config.apiKey) {
        toast.warning(labels.noKey);
        return;
      }
      setPlayingId(voiceId);
      const audio = await synthesize(
        previewText,
        voiceId,
        config.apiKey,
        config.model
      );
      audioPlayer.play(audio);
    } catch (err) {
      const message = err instanceof Error ? err.message : labels.failed;
      logger.error('[VoicePreview] failed:', message);
      toast.error(message);
    } finally {
      setTimeout(() => setPlayingId(null), 3000);
    }
  };

  return { playingId, preview };
}
