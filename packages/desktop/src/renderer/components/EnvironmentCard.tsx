/**
 * @file EnvironmentCard.tsx
 * @description 环境设置卡片。
 * - Git Bash 行：仅 Windows 渲染，检测 bash.exe 是否可用
 * - uv 行：全平台渲染，检测 uv 运行时是否可用，支持一键下载
 */

import React, { useEffect, useState } from 'react';
import {
  CheckCircle,
  AlertCircle,
  ExternalLink,
  Loader2,
  Download,
  RotateCcw,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingRow, SettingDivider } from './SettingRow';
import {
  getBashStatus,
  getUvStatus,
  installUv,
  type BashStatus,
} from '../lib/api';
import { isWin } from '../lib/platform';

const GIT_BASH_DOWNLOAD_URL = 'https://git-scm.com/download/win';

/** 状态行里的小型操作按钮，带图标 + 文字 */
const ActionButton: React.FC<{
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}> = ({ icon, label, onClick }) => (
  <button
    onClick={onClick}
    className="ml-2 flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[12px] text-foreground hover:bg-secondary transition-colors"
  >
    {icon}
    {label}
  </button>
);

// ---------------------------------------------------------------------------
// EnvironmentCard — 容器，组装 Git Bash 行 + uv 行
// ---------------------------------------------------------------------------

export const EnvironmentCard: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl border border-border bg-white px-4 py-4">
      <h3 className="text-[14px] font-bold text-foreground mb-3">
        {t('config.environment')}
      </h3>
      {isWin && (
        <>
          <GitBashRow />
          <SettingDivider />
        </>
      )}
      <UvRow />
    </div>
  );
};

// ---------------------------------------------------------------------------
// GitBashRow — Windows 专用，保留原有逻辑
// ---------------------------------------------------------------------------

const GitBashRow: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>(
    'loading'
  );
  const [bashPath, setBashPath] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getBashStatus()
      .then((result: BashStatus) => {
        if (cancelled) return;
        setBashPath(result.path);
        setStatus(result.ok ? 'ready' : 'missing');
      })
      .catch(() => {
        if (!cancelled) setStatus('missing');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <SettingRow
      label={t('config.gitBash')}
      desc={
        status === 'ready' && bashPath
          ? bashPath
          : status === 'missing'
            ? t('config.gitBashHint')
            : undefined
      }
      descClassName="font-mono truncate"
    >
      {status === 'ready' && (
        <div className="flex items-center gap-1.5 text-green-600">
          <CheckCircle className="w-4 h-4" />
          <span className="text-[13px]">{t('config.gitBashReady')}</span>
        </div>
      )}
      {status === 'missing' && (
        <div className="flex items-center gap-1.5 text-orange-500">
          <AlertCircle className="w-4 h-4" />
          <span className="text-[13px]">{t('config.gitBashMissing')}</span>
          <ActionButton
            icon={<ExternalLink className="w-3 h-3" />}
            label={t('config.gitBashDownload')}
            onClick={() => window.api?.openExternal(GIT_BASH_DOWNLOAD_URL)}
          />
        </div>
      )}
      {status === 'loading' && (
        <span className="text-[13px] text-muted-foreground">
          {t('config.gitBashChecking')}
        </span>
      )}
    </SettingRow>
  );
};

// ---------------------------------------------------------------------------
// UvRow — 全平台，5 态状态机
// ---------------------------------------------------------------------------

type UvState = 'loading' | 'ready' | 'missing' | 'installing' | 'error';

const UvRow: React.FC = () => {
  const { t } = useTranslation();
  const [state, setState] = useState<UvState>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancelled = false;
    getUvStatus()
      .then((result) => {
        if (cancelled) return;
        setState(result.ok ? 'ready' : 'missing');
      })
      .catch(() => {
        if (!cancelled) setState('missing');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleInstall = async () => {
    setState('installing');
    try {
      const result = await installUv();
      setState(result.ok ? 'ready' : 'error');
      if (!result.ok) setErrorMsg(t('config.uvInstallFailed'));
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : t('config.uvInstallFailed')
      );
      setState('error');
    }
  };

  const desc =
    state === 'error'
      ? errorMsg
      : state === 'missing'
        ? t('config.uvHint')
        : undefined;

  return (
    <SettingRow label={t('config.uv')} desc={desc} descClassName="truncate">
      {state === 'ready' && (
        <div className="flex items-center gap-1.5 text-green-600">
          <CheckCircle className="w-4 h-4" />
          <span className="text-[13px]">{t('config.uvReady')}</span>
        </div>
      )}
      {state === 'missing' && (
        <div className="flex items-center gap-1.5 text-orange-500">
          <AlertCircle className="w-4 h-4" />
          <span className="text-[13px]">{t('config.uvMissing')}</span>
          <ActionButton
            icon={<Download className="w-3 h-3" />}
            label={t('config.uvDownload')}
            onClick={handleInstall}
          />
        </div>
      )}
      {state === 'installing' && (
        <div className="flex items-center gap-1.5 text-blue-500">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-[13px]">{t('config.uvInstalling')}</span>
        </div>
      )}
      {state === 'error' && (
        <div className="flex items-center gap-1.5 text-red-500">
          <AlertCircle className="w-4 h-4" />
          <span className="text-[13px]">{t('config.uvInstallFailed')}</span>
          <ActionButton
            icon={<RotateCcw className="w-3 h-3" />}
            label={t('config.uvRetry')}
            onClick={handleInstall}
          />
        </div>
      )}
      {state === 'loading' && (
        <span className="text-[13px] text-muted-foreground">
          {t('config.gitBashChecking')}
        </span>
      )}
    </SettingRow>
  );
};
