/**
 * @file src/renderer/components/SettingsWindow.tsx
 * @description 设置中心主窗口，包含通用设置、模型供应商、MCP 服务、Skills 和语音服务五个标签页
 */

import React, { useEffect, useState } from 'react';
import { Key, Mic, Server, Settings, Zap } from 'lucide-react';
import { ProviderConfigPanel } from './ProviderConfigPanel';
import { ConfigForm } from './ConfigForm';
import { McpListTab } from './McpListTab';
import { SkillListTab } from './SkillListTab';
import { useConfigStore } from '../stores/configStore';
import { useProviderStore } from '../stores/providerStore';
import { toast } from '../stores/toastStore';
import { VoiceConfigPanel } from './VoiceConfigPanel';

type TabKey = 'general' | 'providers' | 'mcp' | 'skills' | 'voice';

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'general', label: '通用设置', icon: <Settings className="w-4 h-4" /> },
  { key: 'providers', label: '模型供应商', icon: <Key className="w-4 h-4" /> },
  { key: 'voice', label: '语音服务', icon: <Mic className="w-4 h-4" /> },
  { key: 'mcp', label: 'MCP 服务', icon: <Server className="w-4 h-4" /> },
  { key: 'skills', label: 'Skills', icon: <Zap className="w-4 h-4" /> },
];

/**
 * 设置中心窗口组件，提供通用设置、模型供应商、MCP 服务、Skills 和语音服务五个标签页的切换和内容展示
 */
export const SettingsWindow: React.FC = () => {
  const { config, loading, saving, error, loadConfig, saveConfig } =
    useConfigStore();
  const { saveAllPending } = useProviderStore();
  const [activeTab, setActiveTab] = useState<TabKey>('general');

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  /**
   * 保存当前通用配置到后端
   */
  const handleSave = async () => {
    if (!config) return;

    try {
      await saveConfig(config);
      toast.success('配置已保存');
    } catch (err) {
      const message = err instanceof Error ? err.message : '保存失败';
      toast.error(`保存失败：${message}`);
    }
  };

  /**
   * 保存所有待写入的 Provider 配置后关闭窗口
   */
  const handleClose = async () => {
    await saveAllPending();
    window.close();
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-600">加载中...</div>
      </div>
    );
  }

  if (error && !config) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-50">
        <div className="text-red-600">加载配置失败：{error}</div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-white">
      <div className="w-56 border-r border-gray-200 bg-gray-50 flex flex-col">
        <div className="px-4 py-4 border-b border-gray-200">
          <h1 className="text-lg font-bold text-gray-900">设置中心</h1>
        </div>

        <nav className="flex-1 py-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                activeTab === tab.key
                  ? 'bg-blue-50 text-blue-600 border-r-2 border-blue-500'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-6">
          {activeTab === 'providers' && <ProviderConfigPanel />}
          {activeTab === 'mcp' && <McpListTab />}
          {activeTab === 'skills' && <SkillListTab />}
          {activeTab === 'general' && <ConfigForm />}
          {activeTab === 'voice' && <VoiceConfigPanel />}
        </div>

        <div className="border-t border-gray-200 px-6 py-4 bg-gray-50">
          <div className="flex justify-end gap-3">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              关闭
            </button>
            {activeTab === 'general' && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
