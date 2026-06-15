/**
 * @file src/renderer/components/ProviderConfigPanel.tsx
 * @description 模型供应商配置面板，管理 API Key 的输入、验证、保存和删除
 * 使用单张大卡片内左右分栏布局，左栏供应商列表、右栏配置详情
 */

import React, { useState, useEffect } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useProviderStore } from '../stores/providerStore';
import { Button } from './ui/Button';
import { PasswordInput } from './ui/PasswordInput';
import { ScrollArea } from './ui/ScrollArea';
import { StatusDot } from './ui/StatusDot';
import { SettingRow } from './SettingRow';
import { toast } from '../stores/toastStore';
import { logger } from '../lib/logger';
import { cn } from '../lib/utils';

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

  return (
    <ScrollArea className="h-full">
      <div className="p-5 flex flex-col gap-4">
        <div
          className="rounded-xl border border-[#e8e8e8] bg-white overflow-hidden flex"
          style={{ minHeight: 'calc(100vh - 120px)' }}
        >
          {/* 左栏: 供应商列表 */}
          <div className="w-56 shrink-0 border-r border-[#f0f0f0] py-3 flex flex-col">
            <div className="px-4 pb-2 mb-1">
              <span className="text-[13px] font-medium text-[#999]">
                {t('provider.selectProvider')}
              </span>
            </div>
            <div className="px-2 flex flex-col gap-0.5">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  onClick={() => handleSelectProvider(provider.id)}
                  className={cn(
                    'w-full px-3 py-2 text-left text-[13px] rounded-lg transition-colors flex items-center justify-between',
                    selectedProvider === provider.id
                      ? 'bg-[#f0f0f0] text-[#333] font-medium'
                      : 'text-[#666] hover:bg-[#f9f9f9]'
                  )}
                >
                  <span>{provider.name}</span>
                  {provider.hasAuth && <StatusDot color="bg-green-500" />}
                </button>
              ))}
            </div>
          </div>

          {/* 右栏: 配置详情 */}
          <div className="flex-1 min-w-0 px-5 py-4 flex flex-col">
            {currentProvider ? (
              <>
                <div className="mb-4">
                  <h3 className="text-[14px] font-bold text-[#333] mb-1">
                    {currentProvider.name}
                  </h3>
                  <p className="text-[12px] text-[#999]">
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
                      className="rounded-lg border-[#e0e0e0] h-8 text-[13px] px-3"
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

                {/* 模型列表: 内嵌分隔线而非独立卡片 */}
                <div className="mt-4 pt-4 border-t border-[#f0f0f0]">
                  <h3 className="text-[14px] font-bold text-[#333] mb-3">
                    {t('provider.availableModels')}
                  </h3>
                  <div className="flex flex-col divide-y divide-[#f0f0f0]">
                    {currentProvider.models.map((model) => (
                      <div
                        key={model}
                        className="flex items-center justify-between py-2.5 first:pt-0 last:pb-0"
                      >
                        <span className="font-mono text-[13px] text-[#333]">
                          {model}
                        </span>
                        {currentProvider.hasAuth && (
                          <Check className="w-3.5 h-3.5 text-green-500" />
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {currentProvider.hasAuth && (
                  <button
                    onClick={handleDelete}
                    className="text-[12px] text-[#ccc] hover:text-red-400 transition-colors mt-4"
                  >
                    {t('provider.deleteApiKey')}
                  </button>
                )}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-[#999]">
                {t('provider.selectToConfigure')}
              </div>
            )}
          </div>
        </div>
      </div>
    </ScrollArea>
  );
};
