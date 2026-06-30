/**
 * @file src/renderer/components/ConfigForm.tsx
 * @description 应用通用配置表单，包括日志开关和存储路径展示
 * 使用卡片分组 + Switch 组件 + SettingRow 统一行布局
 */

import React from 'react';
import { FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConfigStore } from '../stores/configStore';
import { Switch } from './ui/Switch';
import { SettingRow, SettingDivider } from './SettingRow';
import { EnvironmentCard } from './EnvironmentCard';
import { isWin, dataPath } from '../lib/platform';

const STORAGE_PATHS = [
  { labelKey: 'config.agentDir', dir: 'agents' },
  { labelKey: 'config.skillDir', dir: 'skills' },
  { labelKey: 'config.mcpDir', dir: 'mcp' },
  { labelKey: 'config.logDir', dir: 'logs' },
] as const;

function PathRow({ label, path }: { label: string; path: string }) {
  const handleOpen = () => {
    window.api?.openPath(path);
  };

  return (
    <SettingRow label={label} desc={path} descClassName="font-mono truncate">
      <button
        onClick={handleOpen}
        className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        <FolderOpen className="w-3.5 h-3.5" />
      </button>
    </SettingRow>
  );
}

/**
 * 通用配置表单组件，提供日志启用开关和存储路径展示
 */
export const ConfigForm: React.FC = () => {
  const { t, i18n } = useTranslation();
  const { config, updateField, saveConfig } = useConfigStore();

  if (!config) return null;

  /**
   * 切换开关并即时持久化到后端，失败时回滚
   */
  const handleToggle = async (field: 'enableLogging', value: boolean) => {
    const prev = config[field];
    updateField(field, value);
    try {
      await saveConfig({ ...config, [field]: value });
    } catch {
      updateField(field, prev);
    }
  };

  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-white px-4 py-4">
        <h3 className="text-[14px] font-bold text-foreground mb-3">
          {t('config.basic')}
        </h3>
        <SettingRow
          label={t('config.language')}
          desc={t('config.languageDesc')}
        >
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => i18n.changeLanguage('zh-CN')}
              className={`px-3 py-1 text-[13px] leading-[18px] transition-colors ${
                i18n.language === 'zh-CN'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white text-muted-foreground hover:bg-secondary'
              }`}
            >
              中文
            </button>
            <button
              onClick={() => i18n.changeLanguage('en')}
              className={`px-3 py-1 text-[13px] leading-[18px] transition-colors border-l border-border ${
                i18n.language === 'en'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-white text-muted-foreground hover:bg-secondary'
              }`}
            >
              English
            </button>
          </div>
        </SettingRow>
        <SettingDivider />
        <SettingRow
          label={t('config.enableLogging')}
          desc={t('config.enableLoggingDesc')}
        >
          <Switch
            checked={config.enableLogging}
            onCheckedChange={(checked) =>
              handleToggle('enableLogging', checked)
            }
          />
        </SettingRow>
      </div>

      <div className="rounded-xl border border-border bg-white px-4 py-4">
        <h3 className="text-[14px] font-bold text-foreground mb-3">
          {t('config.storagePaths')}
        </h3>
        {STORAGE_PATHS.map((item, i) => (
          <React.Fragment key={item.labelKey}>
            {i > 0 && <SettingDivider />}
            <PathRow label={t(item.labelKey)} path={dataPath(item.dir)} />
          </React.Fragment>
        ))}
      </div>

      {isWin && <EnvironmentCard />}
    </div>
  );
};
