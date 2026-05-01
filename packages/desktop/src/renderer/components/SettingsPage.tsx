/**
 * @file src/renderer/components/SettingsPage.tsx
 * @description 设置中心页面组件，嵌入主窗口右侧内容区域
 * 包含通用设置、模型供应商、MCP 服务、Skills 和语音服务五个标签页
 * 使用浅灰背景 + 白色卡片 + 左侧圆角 Tab 的 Demo 视觉风格
 */

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Key, Mic, Server, Settings, Zap } from 'lucide-react';
import { ProviderConfigPanel } from './ProviderConfigPanel';
import { ConfigForm } from './ConfigForm';
import { McpListTab } from './McpListTab';
import { SkillListTab } from './SkillListTab';
import { VoiceConfigPanel } from './VoiceConfigPanel';
import { useConfigStore } from '../stores/configStore';
import { useProviderStore } from '../stores/providerStore';
import { useViewStore } from '../stores/viewStore';
import { cn } from '../lib/utils';

type TabKey = 'general' | 'providers' | 'mcp' | 'skills' | 'voice';

const tabs: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key: 'general', label: '通用设置', icon: <Settings className="w-4 h-4" /> },
  { key: 'providers', label: '模型供应商', icon: <Key className="w-4 h-4" /> },
  { key: 'voice', label: '语音服务', icon: <Mic className="w-4 h-4" /> },
  { key: 'mcp', label: 'MCP 服务', icon: <Server className="w-4 h-4" /> },
  { key: 'skills', label: 'Skills', icon: <Zap className="w-4 h-4" /> },
];

/**
 * 设置中心页面组件，嵌入主窗口右侧内容区域
 * 提供通用设置、模型供应商、MCP 服务、Skills 和语音服务五个标签页的切换和内容展示
 */
export const SettingsPage: React.FC = () => {
  const { loading, error, loadConfig } = useConfigStore();
  const { saveAllPending } = useProviderStore();
  const setView = useViewStore((s) => s.setView);
  const [activeTab, setActiveTab] = useState<TabKey>('general');

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  /**
   * 保存所有待写入的 Provider 配置后切回聊天视图
   */
  const handleClose = async () => {
    await saveAllPending();
    setView('chat');
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-[#f7f7f7]">
        <div className="text-[#999]">加载中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-[#f7f7f7]">
        <div className="text-red-500">加载配置失败：{error}</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex bg-[#f7f7f7]">
      <div className="w-52 border-r border-[#e8e8e8] bg-white flex flex-col shrink-0">
        <div className="px-4 py-4 flex items-center gap-2">
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-[16px] font-bold text-[#333]">设置中心</h1>
        </div>

        <nav className="flex-1 py-1 px-2">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'w-full flex items-center gap-2.5 px-3 py-2 text-[13px] rounded-lg transition-colors',
                activeTab === tab.key
                  ? 'bg-[#f0f0f0] text-[#333] font-medium'
                  : 'text-[#666] hover:bg-[#f9f9f9]'
              )}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto">
        {activeTab === 'providers' && <ProviderConfigPanel />}
        {activeTab === 'mcp' && <McpListTab />}
        {activeTab === 'skills' && <SkillListTab />}
        {activeTab === 'general' && <ConfigForm />}
        {activeTab === 'voice' && <VoiceConfigPanel />}
      </div>
    </div>
  );
};
