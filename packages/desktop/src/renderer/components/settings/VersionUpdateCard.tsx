/**
 * @file src/renderer/components/settings/VersionUpdateCard.tsx
 * @description 版本与更新卡片
 * - 显示当前版本号
 * - 手动检查更新：检查 → 下载 → 重启安装
 * - 通过 IPC 与主进程的 electron-updater 交互
 */

import React, { useEffect, useState } from 'react';
import { RefreshCw, Download, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingRow, SettingDivider } from '../common/SettingRow';
import { ActionButton } from '../ui/ActionButton';
import { Card } from '../ui/Card';
import type { UpdateStatus } from '@shared/types/api';

/** 卡片内部状态，由主进程推送的 UpdateStatus 映射而来 */
type CardState =
  | { type: 'idle' }
  | { type: 'checking' }
  | { type: 'available'; version: string }
  | { type: 'upToDate' }
  | { type: 'downloading'; percent: number }
  | { type: 'downloaded' }
  | { type: 'error' };

export const VersionUpdateCard: React.FC = () => {
  const { t } = useTranslation();
  const [version, setVersion] = useState('');
  const [state, setState] = useState<CardState>({ type: 'idle' });

  useEffect(() => {
    window.api?.updater.getVersion().then(setVersion);

    const unsubStatus = window.api?.updater.onStatusChange(
      (status: UpdateStatus) => {
        switch (status.type) {
          case 'checking':
            setState({ type: 'checking' });
            break;
          case 'update-available':
            setState({ type: 'available', version: status.version });
            break;
          case 'update-not-available':
            setState({ type: 'upToDate' });
            break;
          case 'downloaded':
            setState({ type: 'downloaded' });
            break;
          case 'error':
            setState({ type: 'error' });
            break;
        }
      }
    );

    const unsubProgress = window.api?.updater.onDownloadProgress((progress) => {
      setState({ type: 'downloading', percent: progress.percent });
    });

    return () => {
      unsubStatus?.();
      unsubProgress?.();
    };
  }, []);

  const handleCheck = () => {
    setState({ type: 'checking' });
    window.api?.updater.checkForUpdates();
  };

  const handleDownload = () => {
    setState({ type: 'downloading', percent: 0 });
    window.api?.updater.downloadUpdate();
  };

  const handleInstall = () => {
    window.api?.updater.installUpdate();
  };

  return (
    <Card title={t('config.versionAndUpdate')}>
      <SettingRow label={t('config.currentVersion')} desc="Persona Desktop">
        <span className="font-mono text-[13px] text-muted-foreground">
          v{version}
        </span>
      </SettingRow>

      <SettingDivider />

      {state.type === 'idle' && (
        <SettingRow
          label={t('config.checkUpdate')}
          desc={t('config.checkUpdateDesc')}
        >
          <ActionButton
            icon={<RefreshCw className="w-3 h-3" />}
            label={t('config.checkUpdate')}
            onClick={handleCheck}
          />
        </SettingRow>
      )}

      {state.type === 'checking' && (
        <SettingRow
          label={t('config.checkingUpdate')}
          desc={t('config.checkingDesc')}
        >
          <div className="flex items-center gap-1.5 text-blue-500">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-[13px]">{t('config.checkingUpdate')}</span>
          </div>
        </SettingRow>
      )}

      {state.type === 'upToDate' && (
        <SettingRow label={t('config.upToDate')}>
          <ActionButton
            icon={<RefreshCw className="w-3 h-3" />}
            label={t('config.checkUpdate')}
            onClick={handleCheck}
          />
        </SettingRow>
      )}

      {state.type === 'available' && (
        <SettingRow
          label={t('config.updateAvailable')}
          desc={`v${state.version}`}
        >
          <ActionButton
            icon={<Download className="w-3 h-3" />}
            label={t('config.downloadUpdate')}
            onClick={handleDownload}
          />
        </SettingRow>
      )}

      {state.type === 'downloading' && (
        <div className="flex flex-col gap-2 py-1">
          <div className="flex items-center justify-between text-[13px]">
            <span className="text-muted-foreground">
              {t('config.downloading')}
            </span>
            <span className="font-mono text-foreground">
              {Math.round(state.percent)}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${state.percent}%` }}
            />
          </div>
        </div>
      )}

      {state.type === 'downloaded' && (
        <SettingRow label={t('config.downloadComplete')} desc={`v${version}`}>
          <ActionButton
            icon={<RotateCcw className="w-3 h-3" />}
            label={t('config.restartAndInstall')}
            onClick={handleInstall}
          />
        </SettingRow>
      )}

      {state.type === 'error' && (
        <SettingRow
          label={t('config.updateError')}
          desc={t('config.updateErrorDesc')}
        >
          <ActionButton
            icon={<RefreshCw className="w-3 h-3" />}
            label={t('config.retry')}
            onClick={handleCheck}
          />
        </SettingRow>
      )}
    </Card>
  );
};
