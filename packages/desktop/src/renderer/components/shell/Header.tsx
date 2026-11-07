/**
 * @file src/renderer/components/shell/Header.tsx
 * @description 聊天区顶部标题栏，显示当前会话标题，提供语音开关和陪伴面板切换。
 * 新对话入口位于 SessionSidebar 的「会话」标题行，Header 不再承载。
 * 窗口拖拽和红绿灯由 TitleBar 统一管理，Header 不再承担拖拽职责。
 * 运行态指示由 LiveStrip 时间线承担，Header 不再承载。
 */
import React, { useCallback, useEffect } from 'react';
import { VenetianMask, Volume2, VolumeX } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSessionStore } from '../../stores/sessionStore';
import { useAgentStore } from '../../stores/agentStore';
import { useCompanionStore } from '../../stores/companionStore';
import { useVoiceStore } from '../../stores/voiceStore';
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
  const voiceReady = useVoiceStore((s) => s.voiceReady);
  const speakStage = useVoiceStore((s) => s.speakStage);
  const toggleVoice = useVoiceStore((s) => s.toggleVoice);
  const voiceWarn = voiceEnabled && voiceReady === false;

  /**
   * 开关开着时随 Agent 变化静默补查能力，覆盖重启恢复与切换 Agent 两种场景。
   * 只定按钮初始视觉态，不弹提醒。
   */
  useEffect(() => {
    if (voiceEnabled) void useVoiceStore.getState().refreshCapability(false);
  }, [currentAgent?.id, voiceEnabled]);

  /**
   * 语音开关永远可点，点击由 voiceStore 现查能力并按缺口弹一次性引导
   */
  const handleVoiceToggle = useCallback(() => {
    void toggleVoice();
  }, [toggleVoice]);

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
              className={cn(
                'relative rounded-xl transition-colors',
                voiceEnabled
                  ? voiceWarn
                    ? 'border-amber-400 bg-orange-50 text-amber-700 hover:bg-orange-50'
                    : 'border-primary/20 bg-primary/10 text-primary hover:bg-primary/15'
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
              <span
                className={cn(
                  'voice-eq',
                  speakStage === 'speaking' && 'voice-eq-open'
                )}
                aria-hidden
              >
                <i />
                <i />
                <i />
              </span>
              {voiceWarn && <span className="voice-badge">!</span>}
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
