/**
 * @file EnvironmentCard.tsx
 * @description 环境设置卡片，展示 Git Bash 检测状态（仅 Windows 渲染）。
 */

import React, { useEffect, useState } from 'react';
import { CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SettingRow } from './SettingRow';
import { getBashStatus, type BashStatus } from '../lib/api';

type Status = 'loading' | 'ready' | 'missing';

const DOWNLOAD_URL = 'https://git-scm.com/download/win';

/**
 * 环境卡片组件。挂载时查询 server 端 Git Bash 检测结果，
 * 根据状态展示「已就绪」或提供「前往下载」入口。
 */
export const EnvironmentCard: React.FC = () => {
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>('loading');
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

  const handleDownload = () => {
    window.api?.openExternal(DOWNLOAD_URL);
  };

  return (
    <div className="rounded-xl border border-border bg-white px-4 py-4">
      <h3 className="text-[14px] font-bold text-foreground mb-3">
        {t('config.environment')}
      </h3>
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
            <button
              onClick={handleDownload}
              className="ml-2 flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[12px] text-foreground hover:bg-secondary transition-colors"
            >
              <ExternalLink className="w-3 h-3" />
              {t('config.gitBashDownload')}
            </button>
          </div>
        )}
        {status === 'loading' && (
          <span className="text-[13px] text-muted-foreground">
            {t('config.gitBashChecking')}
          </span>
        )}
      </SettingRow>
    </div>
  );
};
