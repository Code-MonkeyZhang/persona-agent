/**
 * @file src/renderer/components/agent-editor/ModelConfigCard.tsx
 * @description 模型配置卡片，默认模型、最大步数与系统提示词
 */

import React from 'react';
import { Brain } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ModelSelector } from '../common/ModelSelector';
import { SettingRow, SettingDivider } from '../common/SettingRow';
import { HelpTooltip } from '../ui/HelpTooltip';
import { NumberInput } from './NumberInput';
import type { ProviderStatus } from '../../lib/api';

interface ModelConfigCardProps {
  providers: ProviderStatus[];
  provider: string;
  onProviderChange: (provider: string) => void;
  modelId: string;
  onModelChange: (modelId: string) => void;
  maxSteps: string;
  onMaxStepsChange: (value: string) => void;
  systemPrompt: string;
  onSystemPromptChange: (value: string) => void;
}

/** 模型配置卡片：默认模型选择、最大步数与系统提示词编辑 */
export const ModelConfigCard: React.FC<ModelConfigCardProps> = ({
  providers,
  provider,
  onProviderChange,
  modelId,
  onModelChange,
  maxSteps,
  onMaxStepsChange,
  systemPrompt,
  onSystemPromptChange,
}) => {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-border bg-background px-4 py-4">
      <h3 className="text-[14px] font-bold text-foreground mb-3">
        <Brain className="w-4 h-4 inline-block mr-1.5 -mt-0.5 text-muted-foreground" />
        {t('agentEditor.modelConfig')}
      </h3>
      <SettingRow
        label={t('agentEditor.defaultModel')}
        tooltip={t('agentEditor.defaultModelTooltip')}
      >
        <ModelSelector
          providers={providers}
          value={modelId}
          onChange={onModelChange}
          providerValue={provider}
          onProviderChange={onProviderChange}
          showOnlyVerified={true}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow
        label={t('agentEditor.maxSteps')}
        tooltip={t('agentEditor.maxStepsTooltip')}
      >
        <NumberInput
          value={maxSteps}
          onChange={onMaxStepsChange}
          min={1}
          max={50}
        />
      </SettingRow>
      <SettingDivider />
      <div>
        <div className="flex items-center gap-1.5 text-[14px] text-foreground leading-[18px] min-h-[32px] mb-2">
          {t('agentEditor.systemPrompt')}
          <HelpTooltip text={t('agentEditor.systemPromptTooltip')} />
        </div>
        <textarea
          value={systemPrompt}
          onChange={(e) => onSystemPromptChange(e.target.value)}
          placeholder={t('agentEditor.systemPromptPlaceholder')}
          className="w-full min-h-[360px] rounded-lg border border-border px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
        />
      </div>
    </div>
  );
};
