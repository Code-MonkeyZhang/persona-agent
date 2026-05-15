/**
 * @file stores/voiceStore.ts
 * @description 语音状态管理，负责语音开关、TTS 合成播放
 *
 * 注意：API Key、模型、阈值等配置已迁移到服务端管理，此 store 只负责
 * 接收 speak_ready 事件后调 TTS 播放和全局语音开关
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { synthesize } from '../lib/tts';
import { audioPlayer } from '../lib/audio-player';
import { toast } from './toastStore';
import { logger } from '../lib/logger';

interface VoiceStore {
  isSpeaking: boolean;
  voiceEnabled: boolean;
  toggleVoice: () => void;

  /**
   * 语音播报：直接用服务端传来的参数调 MiniMax TTS API → 播放
   * 所有参数来自服务端 speak_ready WebSocket 事件
   * @param speakText - 服务端处理后的朗读文本
   * @param voiceId - 音色 ID
   * @param apiKey - MiniMax API Key
   * @param model - TTS 模型 ID
   * @param languageBoost - 语言增强参数（可选）
   */
  speak: (
    speakText: string,
    voiceId: string,
    apiKey: string,
    model: string,
    languageBoost?: string
  ) => Promise<void>;
  stopSpeaking: () => void;
}

export const useVoiceStore = create<VoiceStore>()(
  persist(
    (set) => ({
      isSpeaking: false,
      voiceEnabled: false,

      toggleVoice: () => {
        set((state) => ({ voiceEnabled: !state.voiceEnabled }));
      },

      speak: async (speakText, voiceId, apiKey, model, languageBoost) => {
        try {
          if (!speakText.trim()) return;

          const audio = await synthesize(
            speakText,
            voiceId,
            apiKey,
            model,
            languageBoost
          );
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

      stopSpeaking: () => {
        audioPlayer.stop();
        set({ isSpeaking: false });
      },
    }),
    {
      name: 'voice-store',
      partialize: (state) => ({
        voiceEnabled: state.voiceEnabled,
      }),
    }
  )
);
