/**
 * @file src/renderer/components/settings/ConfigForm.tsx
 * @description 应用通用配置表单，包括日志开关、思考过程入口开关、首启引导重放入口和存储路径展示
 * 使用卡片分组 + Switch 组件 + SettingRow 统一行布局
 */

import React from 'react';
import { FolderOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConfigStore } from '../../stores/configStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAgentStore } from '../../stores/agentStore';
import { useViewStore } from '../../stores/viewStore';
import {
  useConnectionStore,
  useCurrentDevice,
  currentDeviceKey,
} from '../../stores/connectionStore';
import { LOCAL_DEVICE_ID } from '@shared/api';
import { Switch } from '../ui/Switch';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { SettingRow, HostChip } from '../common/SettingRow';
import { EnvironmentCard } from './EnvironmentCard';
import { VersionUpdateCard } from './VersionUpdateCard';
import { configFilePath, dataPath, dataRootPath } from '../../lib/platform';

const STORAGE_PATHS = [
  { labelKey: 'config.dataDir', path: dataRootPath() },
  { labelKey: 'config.configFile', path: configFilePath() },
  { labelKey: 'config.agentDir', path: dataPath('agents') },
  { labelKey: 'config.skillDir', path: dataPath('skills') },
  { labelKey: 'config.mcpDir', path: dataPath('mcp') },
  { labelKey: 'config.logDir', path: dataPath('logs') },
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
  const thoughtProcessVisible = useSettingsStore(
    (s) => s.thoughtProcessVisible
  );
  const setThoughtProcessVisible = useSettingsStore(
    (s) => s.setThoughtProcessVisible
  );
  const currentAgent = useAgentStore((s) => s.currentAgent);
  /** 重放引导会向所连 server 写凭据，闸门与首启向导同口径，仅本机连接可用 */
  const isLocalConnection = useConnectionStore(
    (s) => !!s.snapshot && currentDeviceKey(s.snapshot) === LOCAL_DEVICE_ID
  );
  /** 卡头归属标记走当前设备解析，快照未就绪视为本机，不亮标记 */
  const { remote } = useCurrentDevice();

  if (!config) return null;

  /**
   * 切换开关并即时持久化到后端，成功后同步主进程日志开关，失败时回滚
   */
  const handleToggle = async (field: 'enableLogging', value: boolean) => {
    const prev = config[field];
    updateField(field, value);
    try {
      await saveConfig({ ...config, [field]: value });
      await window.api?.setLoggingEnabled(value);
    } catch {
      updateField(field, prev);
    }
  };

  return (
    <div className="p-5 flex flex-col gap-4">
      <Card
        title={t('config.basic')}
        titleClassName="text-title-section font-semibold"
      >
        <div className="flex flex-col gap-4">
          <SettingRow
            label={t('config.language')}
            desc={t('config.languageDesc')}
          >
            <div className="flex rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => i18n.changeLanguage('zh-CN')}
                className={`px-3 py-1 text-body transition-colors ${
                  i18n.language === 'zh-CN'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-white text-muted-foreground hover:bg-muted'
                }`}
              >
                中文
              </button>
              <button
                onClick={() => i18n.changeLanguage('en')}
                className={`px-3 py-1 text-body transition-colors border-l border-border ${
                  i18n.language?.startsWith('en')
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-white text-muted-foreground hover:bg-muted'
                }`}
              >
                English
              </button>
            </div>
          </SettingRow>
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
          {/* 思考过程入口开关：关掉只是不渲染入口，消息数据不动 */}
          <SettingRow
            label={t('config.thoughtProcess')}
            desc={t('config.thoughtProcessDesc')}
          >
            <Switch
              checked={thoughtProcessVisible}
              onCheckedChange={setThoughtProcessVisible}
            />
          </SettingRow>
          <SettingRow
            label={t('config.replayLanding')}
            desc={
              !isLocalConnection
                ? t('config.replayLandingRemoteDesc')
                : currentAgent
                  ? t('config.replayLandingDesc')
                  : t('config.replayLandingEmptyDesc')
            }
          >
            <Button
              variant="secondary"
              size="sm"
              disabled={!currentAgent || !isLocalConnection}
              onClick={() =>
                currentAgent &&
                useViewStore.getState().openLanding(currentAgent.id, 'replay')
              }
            >
              {t('config.replayLandingOpen')}
            </Button>
          </SettingRow>
        </div>
      </Card>

      <EnvironmentCard />

      <VersionUpdateCard />

      <Card
        title={t('config.storagePaths')}
        titleClassName="text-title-section font-semibold"
        action={
          remote ? (
            <HostChip label={t('config.hostLocal')} remote={false} />
          ) : undefined
        }
      >
        <div className="flex flex-col gap-4">
          {STORAGE_PATHS.map((item) => (
            <PathRow
              key={item.labelKey}
              label={t(item.labelKey)}
              path={item.path}
            />
          ))}
        </div>
      </Card>
    </div>
  );
};
