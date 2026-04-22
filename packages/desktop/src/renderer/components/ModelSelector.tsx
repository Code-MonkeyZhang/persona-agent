/**
 * @file src/renderer/components/ModelSelector.tsx
 * @description 模型选择器组件，支持按 Provider 分组展示模型列表并切换
 */

import React from 'react';
import type { ProviderInfo } from '../lib/api';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/Select';

interface ModelSelectorProps {
  providers: ProviderInfo[];
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
  const filteredProviders = showOnlyVerified
    ? providers.filter((p) => p.hasAuth)
    : providers;

  const currentProvider = providers.find(
    (p) => p.models.includes(value) || (providerValue && p.id === providerValue)
  );
  const currentModel = currentProvider?.models.find((m) => m === value);

  const flatOptions: FlatModelOption[] = filteredProviders.flatMap((provider) =>
    provider.models.map((model) => ({
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
    if (onProviderChange && providerId !== providerValue) {
      onProviderChange(providerId);
    }
    onChange(modelId);
  };

  if (filteredProviders.length === 0) {
    return (
      <div
        className={`px-3 py-2 border border-gray-200 rounded-md text-sm text-gray-400 ${className}`}
      >
        暂无可用模型
      </div>
    );
  }

  const displayText = currentModel
    ? `${currentModel} (${currentProvider?.name || ''})`
    : '选择模型';

  if (compact) {
    return (
      <div className={className}>
        <Select
          value={currentValue}
          onValueChange={handleValueChange}
          disabled={disabled}
        >
          <SelectTrigger className="h-8 w-auto min-w-[120px] max-w-[200px] border-0 bg-transparent hover:bg-muted/50 px-2.5 text-xs text-muted-foreground/60 hover:text-muted-foreground shadow-none focus:ring-0 focus:ring-offset-0">
            <SelectValue placeholder="选择模型">
              <span className="truncate">{displayText}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent className="w-[280px]">
            <SelectGroup>
              {flatOptions.map((opt) => (
                <SelectItem
                  key={`${opt.modelId}-${opt.providerId}`}
                  value={`${opt.modelId}::${opt.providerId}`}
                  className="text-sm"
                >
                  <span className="text-foreground">{opt.modelId}</span>
                  <span className="mx-1 text-muted-foreground">-</span>
                  <span className="text-muted-foreground">
                    {opt.providerName}
                  </span>
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className={className}>
      <Select
        value={currentValue}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <SelectTrigger className="w-full px-3 py-2 border border-gray-200 rounded-md text-sm hover:bg-gray-50 focus:ring-blue-500">
          <SelectValue placeholder="选择模型">
            {currentModel ? (
              <>
                <span className="font-medium">{currentModel}</span>
                <span className="text-gray-400 ml-1">
                  ({currentProvider?.name})
                </span>
              </>
            ) : (
              <span className="text-gray-400">选择模型</span>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="w-[320px]">
          <SelectGroup>
            {flatOptions.map((opt) => (
              <SelectItem
                key={`${opt.modelId}-${opt.providerId}`}
                value={`${opt.modelId}::${opt.providerId}`}
                className="text-sm"
              >
                <span className="text-foreground">{opt.modelId}</span>
                <span className="mx-1 text-muted-foreground">-</span>
                <span className="text-muted-foreground">
                  {opt.providerName}
                </span>
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
};
