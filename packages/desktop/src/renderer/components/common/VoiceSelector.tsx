/**
 * @file src/renderer/components/common/VoiceSelector.tsx
 * @description 音色选择器组件，下拉挑选音色，旁边的按钮试听选中音色，Agent 编辑页与首启向导共用
 */

import React from 'react';
import { Loader2, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';
import { useVoicePreview } from '../../hooks/useVoicePreview';
import type { VoiceOption } from '../../lib/api';

/** 「不启用语音」项的选项值，下拉组件不接受空串作选项值，回传调用方时还原为空串 */
const NONE_VALUE = '__none__';

interface VoiceSelectorProps {
  /** 全部可选音色，预设与克隆混合 */
  voices: VoiceOption[];
  /** 当前选中的音色 id，空串表示未启用语音 */
  voiceId: string;
  /** 点选回调，选中「不启用语音」时回传空串 */
  onChange: (voiceId: string) => void;
  /** 朗读语言，试听样本与语言增强参数随它取 */
  voiceLanguage: string;
  /** 是否提供「不启用语音」项 */
  allowNone?: boolean;
  /** 触发器的追加样式，与同页相邻的下拉保持一致的外观 */
  triggerClassName?: string;
}

/**
 * 音色选择器：下拉挑选音色，旁边的按钮按当前朗读语言试听选中音色
 * 试听状态由 useVoicePreview 自持，两处面板共用这一份下拉与按钮
 */
export const VoiceSelector: React.FC<VoiceSelectorProps> = ({
  voices,
  voiceId,
  onChange,
  voiceLanguage,
  allowNone = false,
  triggerClassName,
}) => {
  const { t } = useTranslation();
  const { playingId: previewingVoiceId, preview: previewVoice } =
    useVoicePreview();
  const clonedVoices = voices.filter((v) => v.group === 'cloned');

  return (
    <div className="flex items-center gap-2">
      <Select
        value={voiceId || NONE_VALUE}
        onValueChange={(value) => onChange(value === NONE_VALUE ? '' : value)}
      >
        <SelectTrigger className={cn('h-8 w-48 text-body', triggerClassName)}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {allowNone && (
            <SelectItem value={NONE_VALUE}>
              {t('agentEditor.noVoice')}
            </SelectItem>
          )}
          {clonedVoices.length > 0 && (
            <SelectGroup>
              <SelectLabel className="text-micro text-muted-foreground font-medium uppercase tracking-wide">
                {t('agentEditor.clonedVoices')}
              </SelectLabel>
              {clonedVoices.map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectGroup>
          )}
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel className="text-micro text-muted-foreground font-medium uppercase tracking-wide">
              {t('agentEditor.presetVoices')}
            </SelectLabel>
            {voices
              .filter((v) => v.group === 'preset')
              .map((v) => (
                <SelectItem key={v.id} value={v.id}>
                  {t(`voicePreset.${v.id}`)} ·{' '}
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
        onClick={() =>
          previewVoice(
            voiceId,
            {
              noKey: t('common.configureApiKeyInSettings'),
              failed: t('common.previewFailed'),
            },
            voiceLanguage
          )
        }
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
  );
};
