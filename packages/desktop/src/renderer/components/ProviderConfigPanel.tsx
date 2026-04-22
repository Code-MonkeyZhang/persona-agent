/**
 * @file src/renderer/components/ProviderConfigPanel.tsx
 * @description 模型供应商配置面板，管理 API Key 的输入、验证、保存和删除
 */

import React, { useState, useEffect } from 'react';
import { Check, Eye, EyeOff, Loader2, Trash2 } from 'lucide-react';
import { useProviderStore } from '../stores/providerStore';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { toast } from '../stores/toastStore';
import { logger } from '../lib/logger';

/**
 * 模型供应商配置面板组件，左侧列出供应商、右侧展示 API Key 配置和模型列表
 */
export const ProviderConfigPanel: React.FC = () => {
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
  const [showApiKey, setShowApiKey] = useState(false);
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
    setShowApiKey(false);
    setVerifyStatus(null);
  };

  /**
   * 验证当前输入的 API Key，验证通过后自动保存到后端
   */
  const handleVerify = async () => {
    if (!currentProvider) return;

    if (!displayApiKey.trim()) {
      setVerifyStatus({ valid: false, error: '请输入 API Key' });
      return;
    }

    setPendingCredential(currentProvider.id, displayApiKey);
    const result = await verifyCredential(currentProvider.id, displayApiKey);
    setVerifyStatus({ valid: result.valid, error: result.error });

    if (result.valid) {
      const success = await setCredential(currentProvider.id, displayApiKey);
      if (success) {
        toast.success('保存成功');
        setApiKey('');
        clearPendingCredential(currentProvider.id);
      } else {
        toast.error('保存失败');
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
    if (confirm(`确定要删除 ${currentProvider.name} 的 API Key 吗？`)) {
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
    <div className="flex h-full">
      <div className="w-48 border-r bg-gray-50 flex-shrink-0">
        <div className="py-2 h-full overflow-y-auto">
          {providers.map((provider) => (
            <button
              key={provider.id}
              onClick={() => handleSelectProvider(provider.id)}
              className={`w-full px-4 py-2.5 text-left text-sm transition-all flex items-center justify-between ${
                selectedProvider === provider.id
                  ? 'bg-blue-50 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              <span>{provider.name}</span>
              {provider.hasAuth && (
                <span className="w-2 h-2 rounded-full bg-green-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-y-auto p-6">
          {currentProvider ? (
            <div>
              <div className="mb-6">
                <h3 className="text-base font-medium mb-1">
                  {currentProvider.name}
                </h3>
                <p className="text-sm text-gray-500">
                  配置 {currentProvider.name} 的 API 密钥以启用相关模型
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-2 block">
                    API Key
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showApiKey ? 'text' : 'password'}
                        value={displayApiKey}
                        onChange={(e) => {
                          setApiKey(e.target.value);
                          setVerifyStatus(null);
                        }}
                        placeholder="sk-..."
                        className="pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(!showApiKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {showApiKey ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <Button
                      variant="outline"
                      onClick={handleVerify}
                      disabled={verifyingProvider === currentProvider.id}
                    >
                      {verifyingProvider === currentProvider.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        '验证'
                      )}
                    </Button>
                  </div>
                  {currentProvider.hasAuth && !apiKey && !verifyStatus && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <Check className="w-3 h-3" /> 已配置
                    </p>
                  )}
                  {verifyStatus?.valid && (
                    <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                      <Check className="w-3 h-3" /> API Key 有效
                    </p>
                  )}
                  {verifyStatus?.error && (
                    <p className="text-xs text-red-600 mt-1">
                      {verifyStatus.error}
                    </p>
                  )}
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">
                    可用模型
                  </label>
                  <div className="border rounded-lg divide-y">
                    {currentProvider.models.map((model) => (
                      <div
                        key={model}
                        className="px-3 py-2 text-sm flex items-center justify-between"
                      >
                        <span className="font-mono text-xs">{model}</span>
                        {currentProvider.hasAuth && (
                          <span className="text-xs text-green-600 flex items-center gap-1">
                            <Check className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 flex items-center gap-2">
                  {currentProvider.hasAuth && (
                    <Button
                      variant="outline"
                      onClick={handleDelete}
                      className="text-red-600 border-red-200 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      删除
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-400">
              选择一个供应商进行配置
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
