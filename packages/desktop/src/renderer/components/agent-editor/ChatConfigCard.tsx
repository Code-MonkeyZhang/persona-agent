/**
 * @file src/renderer/components/agent-editor/ChatConfigCard.tsx
 * @description 聊天配置卡片，上下文压缩阈值与做梦间隔
 */

import React from 'react';
import { MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingRow, SettingDivider } from '../common/SettingRow';
import { Card } from '../ui/Card';
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
    <Card title={t('agentEditor.chatConfig')} icon={MessageSquare}>
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
    </Card>
  );
};
