/**
 * @file src/renderer/components/shell/Header.tsx
 * @description 聊天区顶部标题栏，显示当前会话标题，提供语音开关和陪伴面板切换。
 * 新对话入口位于 SessionSidebar 的「会话」标题行，Header 不再承载。
 * 窗口拖拽和红绿灯由 TitleBar 统一管理，Header 不再承担拖拽职责。
 * 运行态指示由 LiveStrip 时间线承担，Header 不再承载。
 */
import React, { useCallback } from 'react';
import { VenetianMask, Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '../../stores/sessionStore';
import { useAgentStore } from '../../stores/agentStore';
import { useCompanionStore } from '../../stores/companionStore';
import { useVoiceStore } from '../../stores/voiceStore';
import { toast } from '../../stores/toastStore';
import { Button } from '../ui/Button';
import { cn } from '../../lib/utils';

/**
 * 顶部标题栏组件，显示当前会话标题，提供语音开关和陪伴面板切换
 */
export const Header: React.FC = () => {
  const { t } = useTranslation();
  const { currentSession } = useSessionStore();
  const { currentAgent } = useAgentStore();
  const visible = useCompanionStore((s) => s.visible);
  const toggleCompanion = useCompanionStore((s) => s.toggleVisible);

  const voiceEnabled = useVoiceStore((s) => s.voiceEnabled);
  const toggleVoice = useVoiceStore((s) => s.toggleVoice);
  const stopSpeaking = useVoiceStore((s) => s.stopSpeaking);
  const voiceConfigured = !!currentAgent?.voiceId;

  /**
   * 语音开关：
   * - 未配置音色 → toast 提示
   * - 已开启 → 先停止当前播放再关闭
   * - 已关闭 → 直接开启
   */
  const handleVoiceToggle = useCallback(() => {
    if (!voiceConfigured) {
      toast.warning(t('companion.configureVoiceFirst'));
      return;
    }
    if (voiceEnabled) stopSpeaking();
    toggleVoice();
  }, [voiceConfigured, voiceEnabled, stopSpeaking, toggleVoice, t]);

  return (
    <header className="h-[65px] border-b border-border flex items-center justify-between bg-background">
      <div className="flex items-center gap-3 pl-4 min-w-0">
        <h1 className="font-semibold text-title-section text-foreground truncate">
          {currentSession?.title || t('header.newChat')}
        </h1>
      </div>
      <div className="flex items-center gap-2 pr-4">
        {currentAgent && (
          <>
            <Button
              variant="outline"
              size="sm"
              onClick={handleVoiceToggle}
              disabled={!voiceConfigured}
              className={cn(
                'rounded-xl transition-colors',
                voiceEnabled
                  ? 'border-primary/20 bg-primary/10 text-primary hover:bg-primary/15'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              title={t('header.voice')}
            >
              {voiceEnabled ? (
                <Volume2 className="w-4 h-4 mr-1" />
              ) : (
                <VolumeX className="w-4 h-4 mr-1" />
              )}
              <span>{t('header.voice')}</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={toggleCompanion}
              className={cn(
                'rounded-xl transition-colors',
                visible
                  ? 'border-primary/20 bg-primary/10 text-primary hover:bg-primary/15'
                  : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground'
              )}
              title={
                visible ? t('header.hideCompanion') : t('header.showCompanion')
              }
            >
              <VenetianMask className="w-4 h-4 mr-1" />
              <span>{t('header.avatar')}</span>
            </Button>
          </>
        )}
      </div>
    </header>
  );
};
