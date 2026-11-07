/**
 * @file stores/voiceStore.ts
 * @description 语音状态机，意图、能力、动画三样状态收口于此
 *
 * voiceEnabled 表达想不想听，持久化在 localStorage；
 * voiceReady 缓存能力是否齐备，由点击现查与 speak 事件回写；
 * speakStage 驱动按钮动画，回合结束点亮，出声展开跳动条，播完收回。
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SpeakErrorReason } from '@persona/shared';
import { synthesize } from '../lib/tts';
import { audioPlayer } from '../lib/audio-player';
import { getTtsConfig } from '../lib/api';
import {
  listMissing,
  missingToI18nKey,
  reasonToMissing,
  shouldNotifyOnDowngrade,
} from '../lib/voice-readiness';
import { toast } from './toastStore';
import { useAgentStore } from './agentStore';
import { logger } from '../lib/logger';
import { getErrorMessage } from '../lib/utils';
import i18n from '../i18n';

/** 播报动画三段，空闲无动画，点亮表语音生成中，跳动条表正在出声 */
export type SpeakStage = 'idle' | 'pending' | 'speaking';

interface VoiceStore {
  /** 意图，想不想听 */
  voiceEnabled: boolean;
  /** 能力缓存，null 未查 true 齐备 false 缺失 */
  voiceReady: boolean | null;
  /** 动画段 */
  speakStage: SpeakStage;

  toggleVoice: () => Promise<void>;
  refreshCapability: (notify: boolean) => Promise<boolean>;
  noteChatSent: (voiceEnabled: boolean, sessionId: string) => void;
  noteRoundEnded: (sessionId: string) => void;
  noteSpeakError: (reason: SpeakErrorReason) => void;
  clearSpeakStage: () => void;
  speak: (
    speakText: string,
    voiceId: string,
    apiKey: string,
    model: string,
    languageBoost?: string
  ) => Promise<void>;
  stopSpeaking: () => void;
}

/** 本机发起且开着语音的回合，等待动画只认这个会话 */
let awaitVoiceSessionId: string | null = null;

export const useVoiceStore = create<VoiceStore>()(
  persist(
    (set, get) => ({
      voiceEnabled: false,
      voiceReady: null,
      speakStage: 'idle',

      /**
       * 切换语音开关。开启前现查能力，缺口当场弹引导；关闭时停播并收动画。
       */
      toggleVoice: async () => {
        const next = !get().voiceEnabled;
        if (!next) {
          logger.info('[VoiceStore] voice disabled');
          get().stopSpeaking();
          set({ voiceEnabled: false });
          return;
        }
        await get().refreshCapability(true);
        set({ voiceEnabled: true });
        logger.info('[VoiceStore] voice enabled', { ready: get().voiceReady });
      },

      /**
       * 现查能力并回写 voiceReady。notify 为真时按缺口逐条弹引导，供点击开启用；
       * 静默路径供重启补查与切 Agent 重查，只定视觉态不打扰。
       */
      refreshCapability: async (notify) => {
        let hasKey = false;
        try {
          const config = await getTtsConfig();
          hasKey = !!config.apiKey;
        } catch (err) {
          logger.warn('[VoiceStore] capability check failed', {
            error: getErrorMessage(err),
          });
        }
        const hasVoice = !!useAgentStore.getState().currentAgent?.voiceId;
        const missing = listMissing({ hasKey, hasVoice });
        const next = missing.length === 0;
        set({ voiceReady: next });
        if (notify) {
          missing.forEach((m) => toast.warning(i18n.t(missingToI18nKey(m))));
        }
        logger.info('[VoiceStore] capability checked', {
          hasKey,
          hasVoice,
          ready: next,
          notify,
        });
        return next;
      },

      /**
       * 发消息时登记，只有本机发起且开着语音的回合才点亮等待动画。
       */
      noteChatSent: (voiceEnabled, sessionId) => {
        awaitVoiceSessionId = voiceEnabled ? sessionId : null;
      },

      /**
       * 回合结束，登记的会话对得上且能力未判缺失就点亮按钮，覆盖整段生成等待。
       */
      noteRoundEnded: (sessionId) => {
        if (sessionId !== awaitVoiceSessionId) return;
        awaitVoiceSessionId = null;
        if (!get().voiceEnabled || get().voiceReady === false) return;
        set({ speakStage: 'pending' });
        logger.info('[VoiceStore] round ended, pending lit', { sessionId });
      },

      /**
       * speak_error 回写。配置类缺口转警示态，边沿触发只在就绪跌缺失那一次提醒；
       * no_content 收掉动画静默返回。
       */
      noteSpeakError: (reason) => {
        const missing = reasonToMissing(reason);
        if (!missing) {
          set({ speakStage: 'idle' });
          return;
        }
        const prev = get().voiceReady;
        set({ voiceReady: false, speakStage: 'idle' });
        if (shouldNotifyOnDowngrade(prev, false)) {
          toast.warning(i18n.t(missingToI18nKey(missing)));
        }
        logger.info('[VoiceStore] speak_error handled', {
          reason,
          prev,
          notified: prev === true,
        });
      },

      clearSpeakStage: () => set({ speakStage: 'idle' }),

      /**
       * 收到 speak_ready 后直连合成并播放。合成期间保持点亮段，真正出声由播放器
       * 开始回调转跳动条，任何一步失败弹错误并收动画，按钮态不动。
       */
      speak: async (speakText, voiceId, apiKey, model, languageBoost) => {
        try {
          if (!speakText.trim()) return;
          set({ voiceReady: true });
          const audio = await synthesize(
            speakText,
            voiceId,
            apiKey,
            model,
            languageBoost
          );
          audioPlayer.play(audio);
        } catch (err) {
          logger.error('[VoiceStore] speak failed:', getErrorMessage(err));
          set({ speakStage: 'idle' });
          toast.error(getErrorMessage(err, i18n.t('voice.broadcastFailed')));
        }
      },

      stopSpeaking: () => {
        awaitVoiceSessionId = null;
        audioPlayer.stop();
        set({ speakStage: 'idle' });
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

/**
 * 播放器生命周期回调在模块加载时挂接一次，驱动动画段切换与播放失败提示。
 */
audioPlayer.setPlaybackCallbacks({
  onStart: () => useVoiceStore.setState({ speakStage: 'speaking' }),
  onEnd: () => useVoiceStore.setState({ speakStage: 'idle' }),
  onError: () => {
    useVoiceStore.setState({ speakStage: 'idle' });
    toast.error(i18n.t('voice.broadcastFailed'));
  },
});
