/**
 * @file src/renderer/components/settings/SettingsPage.tsx
 * @description 设置中心页面组件，嵌入主窗口右侧内容区域
 * 包含通用设置、模型供应商、MCP 服务、Skills 和语音服务五个标签页
 * 使用浅灰背景 + 白色卡片 + 左侧圆角 Tab 的 Demo 视觉风格
 */

import React, { useEffect } from 'react';
import { Key, Speech, Wrench, Settings, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ProviderConfigPanel } from './ProviderConfigPanel';
import { ConfigForm } from './ConfigForm';
import { McpListTab } from './McpListTab';
import { SkillListTab } from './SkillListTab';
import { VoiceConfigPanel } from './VoiceConfigPanel';
import { useConfigStore } from '../../stores/configStore';
import { useProviderStore } from '../../stores/providerStore';
import { useViewStore, type SettingsTab } from '../../stores/viewStore';
import { cn } from '../../lib/utils';
import { BackButton } from '../ui/BackButton';

const tabs: {
  key: SettingsTab;
  label: string;
  description: string;
  icon: React.ReactNode;
}[] = [
  {
    key: 'general',
    label: 'settings.tabs.general',
    description: 'settings.tabs.generalDesc',
    icon: <Settings className="w-4 h-4" />,
  },
  {
    key: 'providers',
    label: 'settings.tabs.providers',
    description: 'settings.tabs.providersDesc',
    icon: <Key className="w-4 h-4" />,
  },
  {
    key: 'voice',
    label: 'settings.tabs.voice',
    description: 'settings.tabs.voiceDesc',
    icon: <Speech className="w-4 h-4" />,
  },
  {
    key: 'mcp',
    label: 'settings.tabs.mcp',
    description: 'settings.tabs.mcpDesc',
    icon: <Wrench className="w-4 h-4" />,
  },
  {
    key: 'skills',
    label: 'settings.tabs.skills',
    description: 'settings.tabs.skillsDesc',
    icon: <Sparkles className="w-4 h-4" />,
  },
];

/**
 * 设置中心页面组件，嵌入主窗口右侧内容区域
 * 提供通用设置、模型供应商、MCP 服务、Skills 和语音服务五个标签页的切换和内容展示
 */
export const SettingsPage: React.FC = () => {
  const { t } = useTranslation();
  const { loading, error, loadConfig } = useConfigStore();
  const { saveAllPending } = useProviderStore();
  const setView = useViewStore((s) => s.setView);
  const activeTab = useViewStore((s) => s.settingsTab);
  const setActiveTab = useViewStore((s) => s.setSettingsTab);

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
      <div className="h-full flex items-center justify-center bg-muted/30">
        <div className="text-muted-foreground">{t('common.loading')}</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/30">
        <div className="text-red-500">
          {t('settings.loadError')}：{error}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full w-full flex bg-muted/30">
      <div className="w-52 border-r border-border bg-white flex flex-col shrink-0">
        <div className="px-4 py-4 flex items-center gap-2">
          <BackButton onClick={handleClose} />
          <h1 className="text-title-section font-semibold text-foreground">
            {t('settings.title')}
          </h1>
        </div>

        <nav className="flex-1 pt-3 pb-1 px-2">
          {tabs.map((tab, index) => (
            <div
              key={tab.key}
              className="settings-item"
              data-selected={activeTab === tab.key || undefined}
            >
              {index > 0 && (
                <div className="settings-separator ml-10 mr-4 h-px bg-border" />
              )}
              <button
                onClick={() => setActiveTab(tab.key)}
                className={cn(
                  'w-full flex items-start gap-2.5 px-3 py-3 rounded-lg transition-[background-color] duration-75 text-left',
                  activeTab === tab.key
                    ? 'bg-secondary'
                    : 'hover:bg-secondary/80'
                )}
              >
                <span
                  className={cn(
                    'mt-px shrink-0',
                    activeTab === tab.key
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  )}
                >
                  {tab.icon}
                </span>
                <span className="flex-1 min-w-0">
                  <span
                    className={cn(
                      'block truncate text-content font-medium',
                      activeTab === tab.key
                        ? 'text-foreground'
                        : 'text-foreground/80'
                    )}
                  >
                    {t(tab.label)}
                  </span>
                  <span className="mt-0.5 block truncate text-caption text-muted-foreground">
                    {t(tab.description)}
                  </span>
                </span>
              </button>
            </div>
          ))}
        </nav>
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto relative">
        {activeTab === 'providers' && <ProviderConfigPanel />}
        {activeTab === 'mcp' && <McpListTab />}
        {activeTab === 'skills' && <SkillListTab />}
        {activeTab === 'general' && <ConfigForm />}
        {activeTab === 'voice' && <VoiceConfigPanel />}
      </div>
    </div>
  );
};
