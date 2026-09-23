/**
 * @file src/renderer/components/settings/ProviderConfigPanel.tsx
 * @description 模型供应商配置面板，管理 API Key 的输入、验证、保存和删除
 * 使用单张大卡片内左右分栏布局，左栏供应商列表、右栏配置详情
 * 头部与密钥区由 ApiKeyCard 渲染，与语音服务面板共用
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProviderStore } from '../../stores/providerStore';
import { ScrollArea } from '../ui/ScrollArea';
import { StatusDot } from '../ui/StatusDot';
import { ProviderMark, ModelMark } from '../common/ProviderMark';
import { ApiKeyCard } from './ApiKeyCard';
import { orderProviders } from '../../lib/providerOrder';
import { toast } from '../../stores/toastStore';
import { logger } from '../../lib/logger';
import { cn } from '../../lib/utils';

/**
 * 模型供应商配置面板组件
 * 左侧列出供应商、右侧展示 API Key 配置和模型列表，整体嵌套在单张圆角卡片内
 */
export const ProviderConfigPanel: React.FC = () => {
  const { t } = useTranslation();
  const {
    providers,
    isLoading,
    verifyingProvider,
    loadProviders,
    setCredential,
    verifyCredential,
    deleteCredential,
    setPendingCredential,
    clearPendingCredential,
  } = useProviderStore();

  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (providers.length > 0 && !selectedProvider) {
      setSelectedProvider(providers[0].id);
    }
  }, [providers, selectedProvider]);

  /**
   * 配置态的单一真相：左栏绿点、标签行绿勾、删除按钮三处统一读本集合
   * 密钥保存或删除后 loadProviders 刷新 hasAuth，集合随之更新
   */
  const configuredIds = useMemo(
    () => new Set(providers.filter((p) => p.hasAuth).map((p) => p.id)),
    [providers]
  );
  const currentProvider = providers.find((p) => p.id === selectedProvider);
  const isConfigured = currentProvider
    ? configuredIds.has(currentProvider.id)
    : false;
  // 选中置顶仅保留给模型下拉场景，面板排序只按已配置置顶加名称字母序
  const orderedProviders = useMemo(
    () => orderProviders(providers, undefined, configuredIds),
    [providers, configuredIds]
  );

  /**
   * 切换当前选中的供应商，重置 API Key 输入和错误提示
   * @param providerId 目标供应商 ID
   */
  const handleSelectProvider = (providerId: string) => {
    setSelectedProvider(providerId);
    setApiKey('');
    setVerifyError(null);
  };

  /**
   * 验证当前输入的 API Key，验证通过后自动保存到后端，成功即清空输入框不回显
   */
  const handleVerify = async () => {
    if (!currentProvider) return;

    setPendingCredential(currentProvider.id, apiKey);
    const result = await verifyCredential(currentProvider.id, apiKey);
    setVerifyError(result.error ?? null);

    if (result.valid) {
      const success = await setCredential(currentProvider.id, apiKey);
      if (success) {
        toast.success(t('common.saveSuccess'));
        setApiKey('');
        clearPendingCredential(currentProvider.id);
      } else {
        toast.error(t('common.saveFailed'));
        logger.error('[ProviderConfig] Failed to save credential');
      }
    } else {
      logger.error('[ProviderConfig] Verification failed:', result.error);
    }
  };

  /**
   * 删除当前供应商已保存的 API Key，确认后调用后端删除接口
   */
  const handleDelete = async () => {
    if (!currentProvider) return;
    if (
      confirm(t('provider.confirmDeleteKey', { name: currentProvider.name }))
    ) {
      const success = await deleteCredential(currentProvider.id);
      if (success) {
        setApiKey('');
        setVerifyError(null);
        clearPendingCredential(currentProvider.id);
      } else {
        logger.error('[ProviderConfig] Failed to delete credential');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  /**
   * 固定高度卡片布局，左右两栏各自独立滚动
   * - 外层 h-full overflow-hidden 接通父级高度链并禁止整页滚动
   * - 卡片 h-full 填满可用高度；左右栏作为 flex 子项加 min-h-0 后才能在内部出滚动条
   * - 每栏用 shrink-0 钉住标题与操作区，列表区用 ScrollArea（flex-1 min-h-0）独立滚动，滚动条覆盖不占位
   */
  return (
    <div className="h-full overflow-hidden p-5">
      <div className="rounded-xl border border-border bg-white overflow-hidden flex h-full">
        {/* 左栏: 供应商列表 */}
        <div className="w-56 shrink-0 border-r border-border py-3 flex flex-col min-h-0">
          <div className="px-4 pb-2 mb-1 shrink-0">
            <span className="text-body font-medium text-muted-foreground">
              {t('provider.selectProvider')}
            </span>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-2 flex flex-col gap-0.5">
              {orderedProviders.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => handleSelectProvider(provider.id)}
                  className={cn(
                    'w-full px-3 py-2 text-left text-body rounded-lg transition-colors flex items-center justify-between',
                    selectedProvider === provider.id
                      ? 'bg-secondary text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-secondary/80'
                  )}
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <ProviderMark
                      providerId={provider.id}
                      name={provider.name}
                      size={18}
                    />
                    <span className="truncate">{provider.name}</span>
                  </span>
                  {configuredIds.has(provider.id) && (
                    <StatusDot color="bg-green-500" />
                  )}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* 右栏: 配置详情 */}
        <div className="flex-1 min-w-0 px-5 py-4 flex flex-col min-h-0">
          {currentProvider ? (
            <>
              {/* 固定区: 品牌头部、API Key 与状态提示 */}
              <div className="shrink-0">
                <ApiKeyCard
                  providerId={currentProvider.id}
                  providerName={currentProvider.name}
                  desc={t('provider.configDesc', {
                    name: currentProvider.name,
                  })}
                  docsUrl={currentProvider.docUrl}
                  apiKey={apiKey}
                  onApiKeyChange={(value) => {
                    setApiKey(value);
                    setVerifyError(null);
                  }}
                  placeholder="sk-..."
                  verifyLabel={t('provider.verify')}
                  verifying={verifyingProvider === currentProvider.id}
                  verified={isConfigured}
                  onVerify={handleVerify}
                  feedback={
                    verifyError && (
                      <p className="text-caption text-red-500 mt-2">
                        {verifyError}
                      </p>
                    )
                  }
                />
              </div>

              {/* 模型列表: 独立滚动区块，标题行带模型计数，外框容器加行 hover */}
              <ScrollArea className="mt-6 flex-1 min-h-0">
                <div className="mb-3 flex items-baseline justify-between">
                  <h3 className="text-title-section font-semibold text-foreground">
                    {t('provider.availableModels')}
                  </h3>
                  <span className="text-caption text-muted-foreground">
                    {t('provider.modelCount', {
                      count: currentProvider.models.length,
                    })}
                  </span>
                </div>
                <div className="rounded-lg border border-border overflow-hidden">
                  <div className="flex flex-col">
                    {currentProvider.models.map((model) => (
                      <div
                        key={model}
                        className="flex items-center justify-between px-3 py-2.5 transition-colors hover:bg-secondary/50"
                      >
                        <span className="flex min-w-0 items-center gap-2">
                          <ModelMark
                            modelId={model}
                            providerId={currentProvider.id}
                            name={currentProvider.name}
                            size={16}
                          />
                          <span
                            title={model}
                            className="font-mono text-body text-foreground truncate"
                          >
                            {model}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </ScrollArea>

              {isConfigured && (
                <button
                  onClick={handleDelete}
                  className="text-caption text-placeholder hover:text-red-400 transition-colors mt-4 shrink-0"
                >
                  {t('provider.deleteApiKey')}
                </button>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {t('provider.selectToConfigure')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
