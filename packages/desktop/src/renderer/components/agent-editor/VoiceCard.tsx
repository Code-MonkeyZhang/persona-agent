/**
 * @file src/renderer/components/agent-editor/VoiceCard.tsx
 * @description 音色卡片，音色选择、试听与 TTS 语言设置，试听样本与语言参数随朗读语言
 */

import React from 'react';
import { Speech } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { VOICE_LANGUAGES } from '@persona/shared';
import {
  Select,
  SelectValue,
  SelectTrigger,
  SelectContent,
  SelectItem,
} from '../ui/Select';
import { SettingRow } from '../common/SettingRow';
import { Card } from '../ui/Card';
import { VoiceSelector } from '../common/VoiceSelector';
import type { VoiceOption } from '../../lib/api';

interface VoiceCardProps {
  voices: VoiceOption[];
  voiceId: string;
  onVoiceChange: (voiceId: string) => void;
  voiceLanguage: string;
  onVoiceLanguageChange: (value: string) => void;
}

/**
 * 音色卡片：音色选择、试听与 TTS 语言设置。
 * 音色下拉与试听按钮交给公共的 VoiceSelector，试听样本与语言参数随当前朗读语言。
 */
export const VoiceCard: React.FC<VoiceCardProps> = ({
  voices,
  voiceId,
  onVoiceChange,
  voiceLanguage,
  onVoiceLanguageChange,
}) => {
  const { t } = useTranslation();

  return (
    <Card title={t('agentEditor.voice')} icon={Speech}>
      <div className="flex flex-col gap-4">
        <SettingRow
          label={t('agentEditor.selectVoice')}
          tooltip={t('agentEditor.selectVoiceDesc')}
        >
          <VoiceSelector
            voices={voices}
            voiceId={voiceId}
            onChange={onVoiceChange}
            voiceLanguage={voiceLanguage}
            allowNone
            triggerClassName="rounded-lg border-border"
          />
        </SettingRow>
        {voiceId && (
          <SettingRow
            label={t('agentEditor.ttsLanguage')}
            tooltip={t('agentEditor.ttsLanguageTooltip')}
          >
            <Select value={voiceLanguage} onValueChange={onVoiceLanguageChange}>
              <SelectTrigger className="rounded-lg border-border h-8 w-48 text-body">
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
        )}
      </div>
    </Card>
  );
};
