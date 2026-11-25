/**
 * @file src/renderer/components/common/ModelSelector.tsx
 * @description 模型选择器组件，全部已配置供应商的模型平铺成单列下拉清单供用户切换，选中态为整行背景高亮
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Check, ScanEye } from 'lucide-react';
import type { ModelConfig } from '@persona/shared';
import type { ProviderStatus } from '../../lib/api';
import { logger } from '../../lib/logger';
import { tierOf } from '../../lib/contextTiers';
import { orderForSelector } from '../../lib/providerOrder';
import { useSettingsStore } from '../../stores/settingsStore';
import { ModelMark } from './ProviderMark';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/Select';

interface ModelSelectorProps {
  /** 全部供应商，组件内部只留已配置密钥的那些 */
  providers: ProviderStatus[];
  /** 当前选中的模型 id */
  modelId: string;
  /** 当前选中模型所属的供应商 id */
  providerId?: string;
  /** 点选回调，一次回传供应商与模型，要不要记上次使用的供应商由调用方决定 */
  onChange: (selection: ModelConfig) => void;
  /** Agent 默认模型所在的供应商，聊天页传它排第二段，Agent 编辑页不传，那里的当前值就是 Agent 默认 */
  agentDefaultProviderId?: string;
  /** 触发器形态，true 是输入框工具栏的无壳 chip，其余场合是设置行的带边框触发器 */
  compact?: boolean;
}

/**
 * 选择器的一行，模型标贴左缘整行垂直居中，名字在上，容量徽章与看图图标在第二行与名字左缘对齐
 * 选中态由外层 SelectItem 的 data-state 驱动，右缘的对钩圆底只在选中行亮起，其余行留同宽空位
 */
function ModelRow({
  provider,
  modelId,
}: {
  provider: ProviderStatus;
  modelId: string;
}) {
  const { t } = useTranslation();
  const contextWindow = provider.contextWindows?.[modelId];
  const hasVision = provider.visionModelIds?.includes(modelId) ?? false;
  return (
    <span className="flex w-full min-w-0 items-center gap-2.5">
      <ModelMark
        modelId={modelId}
        providerId={provider.id}
        name={provider.name}
        size={24}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span
          title={modelId}
          className="min-w-0 truncate font-mono text-foreground"
        >
          {modelId}
        </span>
        <span className="flex h-[18px] items-center gap-1.5">
          {contextWindow !== undefined && (
            <span className="inline-flex h-[18px] shrink-0 items-center rounded-full border border-zinc-300 bg-white px-[7px] text-micro font-medium tabular-nums text-muted-foreground">
              {tierOf(contextWindow)}
            </span>
          )}
          {hasVision && (
            <span
              role="img"
              aria-label={t('model.vision')}
              className="flex shrink-0"
            >
              <ScanEye className="h-3.5 w-3.5 text-muted-foreground" />
            </span>
          )}
        </span>
      </span>
      <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full group-data-[state=checked]:bg-foreground/[0.08]">
        <Check
          className="h-[13px] w-[13px] text-foreground opacity-0 group-data-[state=checked]:opacity-100"
          strokeWidth={3}
        />
      </span>
    </span>
  );
}

/**
 * 模型选择器组件，将全部已配置供应商的模型平铺为单列下拉清单供用户选择
 * 供应商按当前在用、Agent 默认、上次使用依次置顶，其余保持接口下发的配置顺序，模型沿用接口的从新到旧
 * 组件只管排位与呈现，上次使用的供应商由聊天页的点选回调写入，这里只读
 */
export const ModelSelector: React.FC<ModelSelectorProps> = ({
  providers,
  modelId,
  providerId,
  onChange,
  agentDefaultProviderId,
  compact = false,
}) => {
  const { t } = useTranslation();
  const lastUsedProviderId = useSettingsStore((s) => s.lastUsedProviderId);

  const currentProvider =
    providers.find((p) => p.id === providerId) ??
    providers.find((p) => p.models.includes(modelId));
  const currentModel = currentProvider?.models.find((m) => m === modelId);

  const configuredProviders = providers.filter((p) => p.hasAuth);
  const orderedProviders = orderForSelector(
    configuredProviders,
    providerId,
    agentDefaultProviderId,
    lastUsedProviderId
  );
  const flatOptions = orderedProviders.flatMap((provider) =>
    provider.models.map((option) => ({ provider, modelId: option }))
  );

  const currentValue =
    modelId && currentProvider ? `${modelId}::${currentProvider.id}` : '';

  /**
   * 处理下拉选项变更，把 "modelId::providerId" 组合值拆开后一次回传供应商与模型
   * @param combinedValue 格式为 "modelId::providerId" 的组合值
   */
  const handleValueChange = (combinedValue: string) => {
    const [model, provider] = combinedValue.split('::');
    logger.info('[ModelSelector]', 'select', { model, provider });
    onChange({ provider, model });
  };

  /**
   * 面板打开时留一条排位日志，三个位次的输入一并记下，排位不对时可据此排查
   * @param open - 面板是否打开
   */
  const handleOpenChange = (open: boolean) => {
    if (!open) return;
    logger.info('[ModelSelector]', 'open', {
      order: orderedProviders.map((p) => p.id),
      current: providerId,
      agentDefault: agentDefaultProviderId,
      lastUsed: lastUsedProviderId,
    });
  };

  if (configuredProviders.length === 0) {
    return (
      <div className="px-3 py-2 border border-border rounded-md text-body text-gray-400">
        {t('model.noModels')}
      </div>
    );
  }

  const displayText = currentModel || t('model.selectModel');

  const triggerClassName = compact
    ? 'h-8 w-auto max-w-[140px] border-0 bg-transparent hover:bg-muted/50 px-2.5 text-caption text-muted-foreground/60 hover:text-muted-foreground shadow-none focus:ring-0 focus:ring-offset-0 [&>svg]:hidden'
    : 'w-full px-3 py-2 border border-border rounded-md text-body focus:ring-blue-500';

  return (
    <Select
      value={currentValue}
      onValueChange={handleValueChange}
      onOpenChange={handleOpenChange}
    >
      <SelectTrigger className={triggerClassName}>
        <SelectValue placeholder={t('model.selectModel')}>
          <span className="flex min-w-0 items-center gap-2">
            {currentProvider && (
              <ModelMark
                modelId={modelId}
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
      <SelectContent
        className="w-[336px] max-w-[calc(100vw-32px)]"
        collisionPadding={16}
        fade={false}
      >
        <SelectGroup>
          {flatOptions.map(({ provider, modelId: option }) => (
            <SelectItem
              key={`${option}::${provider.id}`}
              value={`${option}::${provider.id}`}
              className="group h-[58px] py-0 pr-2.5 data-[state=unchecked]:focus:bg-muted/50"
            >
              <ModelRow provider={provider} modelId={option} />
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
};
