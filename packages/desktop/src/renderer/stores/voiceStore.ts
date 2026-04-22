/**
 * @file stores/voiceStore.ts
 * @description 语音状态管理，负责 API Key 持久化、语音开关、TTS 合成和摘要
 * 语音开关状态通过 zustand persist 中间件持久化到 localStorage，重启后自动恢复
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getBaseUrl } from '../lib/api';
import { cleanForTTS } from '../lib/tts-cleaner';
import { synthesize } from '../lib/tts';
import { audioPlayer } from '../lib/audio-player';
import { toast } from './toastStore';
import { logger } from '../lib/logger';

const VOICE_API_KEY_STORAGE_KEY = 'minimax-voice-api-key';
const DEFAULT_SUMMARY_THRESHOLD = 200;

interface VoiceStore {
  voiceApiKey: string | null;
  setVoiceApiKey: (key: string) => void;
  loadVoiceApiKey: () => void;

  isSpeaking: boolean;
  voiceEnabled: boolean;
  toggleVoice: () => void;

  summaryThreshold: number;
  setSummaryThreshold: (value: number) => void;

  speak: (
    text: string,
    voiceId: string,
    agentId: string,
    sessionId: string
  ) => Promise<void>;
  stopSpeaking: () => void;
  disableVoice: () => void;
}

export const useVoiceStore = create<VoiceStore>()(
  persist(
    (set, get) => ({
      voiceApiKey: null,
      isSpeaking: false,
      voiceEnabled: false,
      summaryThreshold: DEFAULT_SUMMARY_THRESHOLD,

      /**
       * 从 localStorage 加载 MiniMax API Key 到内存
       */
      loadVoiceApiKey: () => {
        const key = localStorage.getItem(VOICE_API_KEY_STORAGE_KEY);
        set({ voiceApiKey: key });
      },

      /**
       * 保存 API Key 到内存和 localStorage
       * @param key - MiniMax API Key
       */
      setVoiceApiKey: (key: string) => {
        localStorage.setItem(VOICE_API_KEY_STORAGE_KEY, key);
        set({ voiceApiKey: key });
      },

      /**
       * 切换语音播报开关
       */
      toggleVoice: () => {
        set((state) => ({ voiceEnabled: !state.voiceEnabled }));
      },

      /**
       * 设置语音摘要阈值（字符数），超过此长度会先总结再播报
       */
      setSummaryThreshold: (value: number) => {
        set({ summaryThreshold: value });
      },

      /**
       * 核心语音播报流程：
       * 1. 清理 Markdown → 2. 短文本直接用，超过阈值调摘要接口 → 3. TTS 合成 → 4. 播放
       * @param text - Agent 回复文本
       * @param voiceId - 音色 ID
       * @param agentId - Agent ID（用于摘要接口）
       * @param sessionId - Session ID（用于摘要接口）
       */
      speak: async (text, voiceId, agentId, sessionId) => {
        const { voiceApiKey, summaryThreshold } = get();
        if (!voiceApiKey) {
          toast.warning('请先在设置中配置 MiniMax API Key');
          return;
        }

        try {
          const cleaned = cleanForTTS(text);
          let spokenText = cleaned;

          if (cleaned.length > summaryThreshold) {
            logger.info(
              `[TTS] Text too long (${cleaned.length} > ${summaryThreshold}), summarizing...`
            );
            spokenText = await summarizeText(cleaned, agentId, sessionId);
          } else {
            logger.info(
              `[TTS] Text within threshold (${cleaned.length} <= ${summaryThreshold}), using original`
            );
          }

          if (!spokenText.trim()) return;

          const audio = await synthesize(spokenText, voiceId, voiceApiKey);
          set({ isSpeaking: true });
          audioPlayer.play(audio);
        } catch (err) {
          logger.error(
            '[VoiceStore] speak failed:',
            err instanceof Error ? err.message : String(err)
          );
          const message = err instanceof Error ? err.message : '语音播报失败';
          toast.error(message);
        }
      },

      /**
       * 停止当前语音播报
       */
      stopSpeaking: () => {
        audioPlayer.stop();
        set({ isSpeaking: false });
      },

      /**
       * 面板关闭时一次性停止播放、关闭语音开关、重置播报状态
       */
      disableVoice: () => {
        audioPlayer.stop();
        set({ voiceEnabled: false, isSpeaking: false });
      },
    }),
    {
      name: 'nano-agent-voice-store',
      partialize: (state) => ({
        voiceEnabled: state.voiceEnabled,
        summaryThreshold: state.summaryThreshold,
      }),
    }
  )
);

/**
 * 调用服务端摘要接口，将长文本压缩为适合朗读的短摘要
 * 失败时 fallback 到原文
 * @param text - 清理后的文本
 * @param agentId - Agent ID
 * @param sessionId - Session ID
 * @returns 摘要文本，失败时返回原文
 */
async function summarizeText(
  text: string,
  agentId: string,
  sessionId: string
): Promise<string> {
  try {
    const baseUrl = await getBaseUrl();
    const response = await fetch(
      `${baseUrl}/api/agents/${agentId}/sessions/${sessionId}/summarize`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      }
    );

    if (!response.ok) {
      logger.warn('[VoiceStore] Summarize failed, using original text');
      return text;
    }

    const data = (await response.json()) as { summary: string };
    return data.summary || text;
  } catch {
    logger.warn('[VoiceStore] Summarize error, using original text');
    return text;
  }
}
