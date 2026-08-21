/**
 * @file src/renderer/components/agent-editor/VoiceCard.tsx
 * @description 音色卡片，音色选择、试听与 TTS 语言设置
 */

import React from 'react';
import { Loader2, Speech, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Select,
  SelectGroup,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectSeparator,
} from '../ui/Select';
import { SettingRow, SettingDivider } from '../common/SettingRow';
import { Card } from '../ui/Card';
import { useVoicePreview } from '../../hooks/useVoicePreview';
import type { VoiceOption } from '../../lib/api';

const PREVIEW_TEXTS = [
  '你好呀，很高兴见到你，今天有什么我可以帮忙的吗？',
  '今天天气真不错，适合出去走走呢。',
  '嗨，我是你的语音助手，有什么想聊的吗？',
];

const VOICE_LANGUAGES = [
  { value: 'default', labelKey: 'agentEditor.langDefault' },
  { value: 'zh', labelKey: 'agentEditor.langZh' },
  { value: 'en', labelKey: 'agentEditor.langEn' },
  { value: 'ja', labelKey: 'agentEditor.langJa' },
] as const;

interface VoiceCardProps {
  voices: VoiceOption[];
  voiceId: string;
  onVoiceChange: (voiceId: string) => void;
  voiceLanguage: string;
  onVoiceLanguageChange: (value: string) => void;
}

/**
 * 音色卡片：音色选择、随机文案试听与 TTS 语言设置。
 * 试听状态由 useVoicePreview 自持。
 */
export const VoiceCard: React.FC<VoiceCardProps> = ({
  voices,
  voiceId,
  onVoiceChange,
  voiceLanguage,
  onVoiceLanguageChange,
}) => {
  const { t } = useTranslation();
  const { playingId: previewingVoiceId, preview: previewVoice } =
    useVoicePreview();

  return (
    <Card title={t('agentEditor.voice')} icon={Speech}>
      <SettingRow
        label={t('agentEditor.selectVoice')}
        tooltip={t('agentEditor.selectVoiceDesc')}
      >
        <div className="flex items-center gap-2">
          <Select value={voiceId || '__none__'} onValueChange={onVoiceChange}>
            <SelectTrigger className="rounded-lg border-border h-8 w-48 text-[13px]">
              <SelectValue placeholder={t('agentEditor.noVoice')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">
                {t('agentEditor.noVoice')}
              </SelectItem>
              {voices.filter((v) => v.group === 'cloned').length > 0 && (
                <SelectGroup>
                  <SelectLabel className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                    {t('agentEditor.clonedVoices')}
                  </SelectLabel>
                  {voices
                    .filter((v) => v.group === 'cloned')
                    .map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                </SelectGroup>
              )}
              <SelectSeparator />
              <SelectGroup>
                <SelectLabel className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                  {t('agentEditor.presetVoices')}
                </SelectLabel>
                {voices
                  .filter((v) => v.group === 'preset')
                  .map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {t('voicePreset.' + v.id)} ·{' '}
                      {v.gender === 'male'
                        ? t('agentEditor.male')
                        : v.gender === 'female'
                          ? t('agentEditor.female')
                          : ''}
                    </SelectItem>
                  ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <button
            onClick={() => {
              const text =
                PREVIEW_TEXTS[Math.floor(Math.random() * PREVIEW_TEXTS.length)];
              previewVoice(voiceId, text, {
                noKey: t('common.configureApiKeyInSettings'),
                failed: t('common.previewFailed'),
              });
            }}
            disabled={!voiceId || !!previewingVoiceId}
            className="rounded-lg border border-border w-8 h-8 shrink-0 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {previewingVoiceId ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </SettingRow>
      {voiceId && (
        <>
          <SettingDivider />
          <SettingRow
            label={t('agentEditor.ttsLanguage')}
            tooltip={t('agentEditor.ttsLanguageTooltip')}
          >
            <Select value={voiceLanguage} onValueChange={onVoiceLanguageChange}>
              <SelectTrigger className="rounded-lg border-border h-8 w-48 text-[13px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VOICE_LANGUAGES.map((l) => (
                  <SelectItem key={l.value} value={l.value}>
                    {t(l.labelKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </SettingRow>
        </>
      )}
    </Card>
  );
};
