/**
 * @file src/renderer/components/common/ModelSelector.tsx
 * @description 模型选择器组件，按供应商分组展示模型列表并切换，选中态为整行背景高亮
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import type { ProviderStatus } from '../../lib/api';
import { logger } from '../../lib/logger';
import { orderProviders } from '../../lib/providerOrder';
import { ProviderMark } from './ProviderMark';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';

interface ModelSelectorProps {
  providers: ProviderStatus[];
  value: string;
  onChange: (modelId: string) => void;
  providerValue?: string;
  onProviderChange?: (providerId: string) => void;
  showOnlyVerified?: boolean;
  className?: string;
  disabled?: boolean;
  compact?: boolean;
}

interface FlatModelOption {
  modelId: string;
  providerId: string;
  providerName: string;
}

/**
 * 模型选择器组件，将多个 Provider 的模型平铺为下拉列表供用户选择
 */
export const ModelSelector: React.FC<ModelSelectorProps> = ({
  providers,
  value,
  onChange,
  providerValue,
  onProviderChange,
  showOnlyVerified = true,
  className = '',
  disabled = false,
  compact = false,
}) => {
  const { t } = useTranslation();
  const filteredProviders = showOnlyVerified
    ? providers.filter((p) => p.hasAuth)
    : providers;

  const currentProvider = providers.find(
    (p) => p.models.includes(value) || (providerValue && p.id === providerValue)
  );
  const currentModel = currentProvider?.models.find((m) => m === value);

  const configuredIds = new Set(
    filteredProviders.filter((p) => p.hasAuth).map((p) => p.id)
  );
  const orderedProviders = orderProviders(
    filteredProviders,
    currentProvider?.id,
    configuredIds
  );

  const flatOptions: FlatModelOption[] = orderedProviders.flatMap((provider) =>
    [...provider.models]
      .sort((a, b) => a.localeCompare(b))
      .map((model) => ({
        modelId: model,
        providerId: provider.id,
        providerName: provider.name,
      }))
  );

  const currentValue =
    value && (providerValue || currentProvider?.id)
      ? `${value}::${providerValue || currentProvider?.id}`
      : '';

  /**
   * 处理下拉选项变更，将 "模型ID::ProviderID" 组合值拆分后分别回调
   * @param combinedValue 格式为 "modelId::providerId" 的组合值
   */
  const handleValueChange = (combinedValue: string) => {
    const [modelId, providerId] = combinedValue.split('::');
    logger.info('[ModelSelector]', 'select', {
      model: modelId,
      provider: providerId,
    });
    if (onProviderChange && providerId !== providerValue) {
      onProviderChange(providerId);
    }
    onChange(modelId);
  };

  if (filteredProviders.length === 0) {
    return (
      <div
        className={`px-3 py-2 border border-gray-200 rounded-md text-content text-gray-400 ${className}`}
      >
        {t('model.noModels')}
      </div>
    );
  }

  const displayText = currentModel || t('model.selectModel');

  const triggerClassName = compact
    ? 'h-8 w-auto max-w-[140px] border-0 bg-transparent hover:bg-muted/50 px-2.5 text-caption text-muted-foreground/60 hover:text-muted-foreground shadow-none focus:ring-0 focus:ring-offset-0 [&>svg]:hidden'
    : 'w-full px-3 py-2 border border-gray-200 rounded-md text-content hover:bg-gray-50 focus:ring-blue-500';

  return (
    <div className={className}>
      <Select
        value={currentValue}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger className={triggerClassName}>
          <SelectValue placeholder={t('model.selectModel')}>
            <span className="flex min-w-0 items-center gap-1.5">
              {currentProvider && (
                <ProviderMark
                  providerId={currentProvider.id}
                  name={currentProvider.name}
                  size={18}
                />
              )}
              <span
                className={`truncate ${compact ? '' : 'font-medium'} text-foreground`}
              >
                {displayText}
              </span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {flatOptions.map((opt) => (
              <SelectItem
                key={`${opt.modelId}-${opt.providerId}`}
                value={`${opt.modelId}::${opt.providerId}`}
                className="text-content"
              >
                <span className="flex w-full min-w-0 items-center gap-1.5">
                  <ProviderMark
                    providerId={opt.providerId}
                    name={opt.providerName}
                    size={18}
                  />
                  <span
                    title={opt.modelId}
                    className="min-w-0 flex-1 truncate text-foreground"
                  >
                    {opt.modelId}
                  </span>
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
};
