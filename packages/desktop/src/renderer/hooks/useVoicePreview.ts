/**
 * @file src/renderer/hooks/useVoicePreview.ts
 * @description 语音试听 hook，封装 TTS 配置检查、按朗读语言取样、合成、播放和状态管理
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getLanguageBoost } from '@persona/shared';
import { getTtsConfig } from '../lib/api';
import { synthesize } from '../lib/tts';
import { audioPlayer } from '../lib/audio-player';
import { toast } from '../stores/toastStore';
import { logger } from '../lib/logger';
import { getErrorMessage } from '../lib/utils';
import { pickPreviewSample } from '../lib/voice-preview-samples';

interface PreviewLabels {
  noKey: string;
  failed: string;
}

/**
 * 语音试听 hook，管理试听状态并提供 preview 方法。
 * @returns playingId - 正在试听的音色 ID
 * @returns preview - 试听指定音色
 */
export function useVoicePreview() {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const { i18n } = useTranslation();

  /**
   * 试听指定音色：检查 API Key → 按朗读语言取样本 → 合成 → 播放，这段音频播完或被替换时重置状态
   * @param voiceId - 试听的音色 ID
   * @param labels - 缺 Key 与试听失败时的提示文案
   * @param voiceLanguage - 朗读语言，缺省时样本随界面语言且不带语言增强
   */
  const preview = async (
    voiceId: string,
    labels: PreviewLabels,
    voiceLanguage?: string
  ) => {
    try {
      const config = await getTtsConfig();
      if (!config.apiKey) {
        toast.warning(labels.noKey);
        return;
      }
      const { language, text } = pickPreviewSample(
        voiceLanguage,
        i18n.language
      );
      const languageBoost = getLanguageBoost(voiceLanguage);
      setPlayingId(voiceId);
      logger.info('[VoicePreview] start', {
        voiceId,
        voiceLanguage,
        language,
        languageBoost,
      });
      const audio = await synthesize(
        text,
        voiceId,
        config.apiKey,
        config.model,
        languageBoost
      );
      await audioPlayer.play(audio);
      logger.info('[VoicePreview] end', { voiceId });
    } catch (err) {
      const message = getErrorMessage(err, labels.failed);
      logger.error('[VoicePreview] failed:', message);
      toast.error(message);
    } finally {
      // 只清掉自己这次试听的状态，被新的试听替换时留给新试听收尾
      setPlayingId((current) => (current === voiceId ? null : current));
    }
  };

  return { playingId, preview };
}
