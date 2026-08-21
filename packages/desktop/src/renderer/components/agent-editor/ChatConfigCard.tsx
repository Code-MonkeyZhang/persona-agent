/**
 * @file src/renderer/components/agent-editor/ChatConfigCard.tsx
 * @description 聊天配置卡片，上下文压缩阈值与做梦间隔
 */

import React from 'react';
import { MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingRow, SettingDivider } from '../common/SettingRow';
import { NumberInput } from './NumberInput';

interface ChatConfigCardProps {
  compressionThreshold: string;
  onCompressionThresholdChange: (value: string) => void;
  dreamIntervalMinutes: string;
  onDreamIntervalChange: (value: string) => void;
}

/** 聊天配置卡片：上下文压缩阈值与做梦间隔编辑 */
export const ChatConfigCard: React.FC<ChatConfigCardProps> = ({
  compressionThreshold,
  onCompressionThresholdChange,
  dreamIntervalMinutes,
  onDreamIntervalChange,
}) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-border bg-background px-4 py-4">
      <h3 className="text-[14px] font-bold text-foreground mb-3">
        <MessageSquare className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-muted-foreground" />
        {t('agentEditor.chatConfig')}
      </h3>
      <SettingRow
        label={t('agentEditor.compressionThreshold')}
        tooltip={t('agentEditor.compressionThresholdTooltip')}
      >
        <NumberInput
          value={compressionThreshold}
          onChange={onCompressionThresholdChange}
          min={1}
          max={100}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow
        label={t('agentEditor.dreamInterval')}
        tooltip={t('agentEditor.dreamIntervalTooltip')}
      >
        <NumberInput
          value={dreamIntervalMinutes}
          onChange={onDreamIntervalChange}
          min={1}
        />
      </SettingRow>
    </div>
  );
};
