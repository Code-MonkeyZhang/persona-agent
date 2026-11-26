/**
 * @file src/renderer/components/common/VoiceSelector.tsx
 * @description 音色选择器组件，下拉按克隆、女声、男声、其他分组挑选音色，旁边的按钮试听选中音色，Agent 编辑页与首启向导共用
 */

import React from 'react';
import { Loader2, Volume2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { groupVoices, type VoiceGroup } from '@persona/shared';
import { cn } from '../../lib/utils';
import { logger } from '../../lib/logger';
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
  /** 全部可选音色，预设与克隆混合，分组在组件内完成 */
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
 * 音色选择器：下拉按克隆、女声、男声、其他分组挑选音色，旁边的按钮按当前朗读语言试听选中音色
 * 分组规则由公共包的 groupVoices 给出，试听状态由 useVoicePreview 自持，两处面板共用这一份下拉与按钮
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
  const groups = groupVoices(voices);
  const clonedGroup = groups.find((g) => g.key === 'cloned');
  /** 「不启用语音」项与克隆组是用户自己的区段，它与预设音色之间画一条分隔线 */
  const hasOwnSection = allowNone || clonedGroup !== undefined;

  /** 输出一个分组，预设音色显示翻译后的名字，克隆音色显示用户起的名字 */
  const renderGroup = (group: VoiceGroup) => (
    <SelectGroup key={group.key}>
      <SelectLabel className="text-micro text-muted-foreground font-medium uppercase tracking-wide">
        {t(group.labelKey)}
      </SelectLabel>
      {group.items.map((v) => (
        <SelectItem key={v.id} value={v.id}>
          {v.group === 'preset' ? t(`voicePreset.${v.id}`) : v.name}
        </SelectItem>
      ))}
    </SelectGroup>
  );

  /** 面板打开时留一条分组日志，各组数量一并记下，分组不对时可据此排查 */
  const handleOpenChange = (open: boolean) => {
    if (!open) return;
    logger.info('[VoiceSelector]', 'open', {
      groups: Object.fromEntries(groups.map((g) => [g.key, g.items.length])),
      current: voiceId,
    });
  };

  /** 点选后回传音色 id 并留一条日志，「不启用语音」还原为空串 */
  const handleValueChange = (value: string) => {
    const next = value === NONE_VALUE ? '' : value;
    logger.info('[VoiceSelector]', 'select', { voiceId: next });
    onChange(next);
  };

  return (
    <div className="flex items-center gap-2">
      <Select
        value={voiceId || NONE_VALUE}
        onValueChange={handleValueChange}
        onOpenChange={handleOpenChange}
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
          {clonedGroup && renderGroup(clonedGroup)}
          {hasOwnSection && <SelectSeparator />}
          {groups.filter((group) => group !== clonedGroup).map(renderGroup)}
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
