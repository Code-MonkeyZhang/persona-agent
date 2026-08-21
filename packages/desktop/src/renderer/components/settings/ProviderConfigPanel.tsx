/**
 * @file src/renderer/components/settings/ProviderConfigPanel.tsx
 * @description 模型供应商配置面板，管理 API Key 的输入、验证、保存和删除
 * 使用单张大卡片内左右分栏布局，左栏供应商列表、右栏配置详情
 */

import React, { useState, useEffect } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProviderStore } from '../../stores/providerStore';
import { Button } from '../ui/Button';
import { PasswordInput } from '../ui/PasswordInput';
import { ScrollArea } from '../ui/ScrollArea';
import { StatusDot } from '../ui/StatusDot';
import { SettingRow } from '../common/SettingRow';
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
  const [verifyStatus, setVerifyStatus] = useState<{
    valid: boolean;
    error?: string;
  } | null>(null);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    if (providers.length > 0 && !selectedProvider) {
      setSelectedProvider(providers[0].id);
    }
  }, [providers, selectedProvider]);

  const currentProvider = providers.find((p) => p.id === selectedProvider);
  const displayApiKey = apiKey || '';

  /**
   * 切换当前选中的供应商，重置 API Key 输入和验证状态
   * @param providerId 目标供应商 ID
   */
  const handleSelectProvider = (providerId: string) => {
    setSelectedProvider(providerId);
    setApiKey('');
    setVerifyStatus(null);
  };

  /**
   * 验证当前输入的 API Key，验证通过后自动保存到后端
   */
  const handleVerify = async () => {
    if (!currentProvider) return;

    if (!displayApiKey.trim()) {
      setVerifyStatus({ valid: false, error: t('provider.enterApiKey') });
      return;
    }

    setPendingCredential(currentProvider.id, displayApiKey);
    const result = await verifyCredential(currentProvider.id, displayApiKey);
    setVerifyStatus({ valid: result.valid, error: result.error });

    if (result.valid) {
      const success = await setCredential(currentProvider.id, displayApiKey);
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
        setVerifyStatus(null);
        clearPendingCredential(currentProvider.id);
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
            <span className="text-[13px] font-medium text-muted-foreground">
              {t('provider.selectProvider')}
            </span>
          </div>
          <ScrollArea className="flex-1 min-h-0">
            <div className="px-2 flex flex-col gap-0.5">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => handleSelectProvider(provider.id)}
                  className={cn(
                    'w-full px-3 py-2 text-left text-[13px] rounded-lg transition-colors flex items-center justify-between',
                    selectedProvider === provider.id
                      ? 'bg-secondary text-foreground font-medium'
                      : 'text-muted-foreground hover:bg-secondary/80'
                  )}
                >
                  <span>{provider.name}</span>
                  {provider.hasAuth && <StatusDot color="bg-green-500" />}
                </button>
              ))}
            </div>
          </ScrollArea>
        </div>

        {/* 右栏: 配置详情 */}
        <div className="flex-1 min-w-0 px-5 py-4 flex flex-col min-h-0">
          {currentProvider ? (
            <>
              {/* 固定区: 标题、API Key 与状态提示 */}
              <div className="shrink-0">
                <div className="mb-4">
                  <h3 className="text-[14px] font-bold text-foreground mb-1">
                    {currentProvider.name}
                  </h3>
                  <p className="text-[12px] text-muted-foreground">
                    {t('provider.configDesc', { name: currentProvider.name })}
                  </p>
                </div>

                <SettingRow label="API Key">
                  <div className="flex items-center gap-2">
                    <PasswordInput
                      value={displayApiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        setVerifyStatus(null);
                      }}
                      placeholder="sk-..."
                    />
                    <Button
                      variant="outline"
                      onClick={handleVerify}
                      disabled={verifyingProvider === currentProvider.id}
                      className="rounded-lg border-input h-8 text-[13px] px-3"
                    >
                      {verifyingProvider === currentProvider.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        t('provider.verify')
                      )}
                    </Button>
                  </div>
                </SettingRow>

                {currentProvider.hasAuth && !apiKey && !verifyStatus && (
                  <p className="text-[12px] text-green-600 mt-2 flex items-center gap-1">
                    <Check className="w-3 h-3" /> {t('provider.configured')}
                  </p>
                )}
                {verifyStatus?.valid && (
                  <p className="text-[12px] text-green-600 mt-2 flex items-center gap-1">
                    <Check className="w-3 h-3" /> {t('provider.apiKeyValid')}
                  </p>
                )}
                {verifyStatus?.error && (
                  <p className="text-[12px] text-red-500 mt-2">
                    {verifyStatus.error}
                  </p>
                )}
              </div>

              {/* 模型列表: 内嵌分隔线而非独立卡片，区域独立滚动 */}
              <ScrollArea className="mt-4 pt-4 border-t border-border flex-1 min-h-0">
                <h3 className="text-[14px] font-bold text-foreground mb-3">
                  {t('provider.availableModels')}
                </h3>
                <div className="flex flex-col divide-y divide-border">
                  {currentProvider.models.map((model) => (
                    <div
                      key={model}
                      className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                    >
                      <span className="font-mono text-[13px] text-foreground">
                        {model}
                      </span>
                    </div>
                  ))}
                </div>
              </ScrollArea>

              {currentProvider.hasAuth && (
                <button
                  onClick={handleDelete}
                  className="text-[12px] text-placeholder hover:text-red-400 transition-colors mt-4 shrink-0"
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
