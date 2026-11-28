/**
 * @file src/renderer/components/settings/EnvironmentCard.tsx
 * @description 环境设置卡片。
 * - Git Bash 行：仅 Windows 渲染，检测 bash.exe 是否可用
 * - 工具运行环境行：全平台渲染，状态来自 runtimeStore，下载在服务端后台进行
 * 行右侧只放动作或结果，进度和失败原因收进行名下面，用途说明只写在问号提示里。
 * 下载中右边的按钮留在原位，图标位置换成转圈，按钮点不动。
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
import type { RuntimeInstallState } from '@persona/shared';
import { SettingRow, RemoteHostChip } from '../common/SettingRow';
import { ActionButton } from '../ui/ActionButton';
import { Card } from '../ui/Card';
import { getBashStatus, type BashStatus } from '../../lib/api';
import { isWin } from '../../lib/platform';
import {
  deriveUvState,
  FAILED_KEY,
  useRuntimeStore,
} from '../../stores/runtimeStore';

const GIT_BASH_DOWNLOAD_URL = 'https://git-scm.com/download/win';

// ---------------------------------------------------------------------------
// EnvironmentCard — 容器，组装 Git Bash 行 + 工具运行环境行
// ---------------------------------------------------------------------------

export const EnvironmentCard: React.FC = () => {
  const { t } = useTranslation();

  return (
    <Card
      title={t('config.environment')}
      titleClassName="text-title-section font-semibold"
      action={<RemoteHostChip />}
    >
      <div className="flex flex-col gap-4">
        {isWin && <GitBashRow />}
        <UvRow />
      </div>
    </Card>
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
          <span className="text-body">{t('config.gitBashReady')}</span>
        </div>
      )}
      {status === 'missing' && (
        <div className="flex items-center gap-1.5 text-orange-500">
          <AlertCircle className="w-4 h-4" />
          <span className="text-body">{t('config.gitBashMissing')}</span>
          <ActionButton
            variant="outline"
            onClick={() => window.api?.openExternal(GIT_BASH_DOWNLOAD_URL)}
          >
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
            {t('config.gitBashDownload')}
          </ActionButton>
        </div>
      )}
      {status === 'loading' && (
        <span className="text-body text-muted-foreground">
          {t('config.gitBashChecking')}
        </span>
      )}
    </SettingRow>
  );
};

// ---------------------------------------------------------------------------
// UvRow — 全平台，状态由 runtimeStore 推导，四态
// ---------------------------------------------------------------------------

/** 字节数格式成 MB，保留一位小数 */
function formatMb(bytes: number): string {
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

/**
 * 安装中跟在行下面的进度块，与行右侧按钮里的转圈互不重复。
 * 连接段没有总量，只显示正在连接；setup 步没有字节数，只有一行正在安装。
 */
function InstallProgress({ install }: { install: RuntimeInstallState }) {
  const { t } = useTranslation();

  if (install.step === 'setup') {
    return (
      <div className="text-caption text-muted-foreground">
        {t('config.uvStepSetup')}
      </div>
    );
  }

  const stepLabel =
    install.step === 'uv' ? t('config.uvStepUv') : t('config.uvStepPython');

  if (install.total === null) {
    return (
      <div className="flex flex-col gap-1.5">
        <div className="text-caption text-muted-foreground">{stepLabel}</div>
        <div className="h-1.5 rounded-full bg-muted" />
        <div className="text-micro text-muted-foreground">
          {t('config.uvConnecting')}
        </div>
      </div>
    );
  }

  const percent = Math.min(
    100,
    Math.round((install.received / install.total) * 100)
  );
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-caption">
        <span className="text-muted-foreground">{stepLabel}</span>
        <span className="text-foreground tabular-nums">{percent}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary transition-all duration-150 ease-out"
          style={{ width: `${percent}%` }}
        />
      </div>
      <div className="text-micro text-muted-foreground tabular-nums">
        {formatMb(install.received)} / {formatMb(install.total)}
      </div>
    </div>
  );
}

const UvRow: React.FC = () => {
  const { t } = useTranslation();
  const uv = useRuntimeStore((s) => s.uv);
  const install = useRuntimeStore((s) => s.install);
  const start = useRuntimeStore((s) => s.start);

  /** 四个显示态由数据推导，进行中的安装最优先，失败落回未安装，装好覆盖次之 */
  const state = deriveUvState(uv, install);

  /** 失败类别只在未安装行上兑现 */
  const failedKind =
    state === 'missing' && install?.status === 'failed' ? install.error : null;

  /** 行名下面只在失败时留一句类别，没下载过时这里不写字，用途写在问号提示里 */
  const desc = failedKind ? t(FAILED_KEY[failedKind]) : undefined;

  return (
    <>
      <SettingRow
        label={t('config.uv')}
        desc={desc}
        descClassName="!text-orange-500"
        tooltip={t('config.uvTooltip')}
      >
        {state === 'ready' && (
          <div className="flex items-center gap-1.5 text-green-600">
            <CheckCircle className="w-4 h-4" />
            <span className="text-body">{t('config.uvReady')}</span>
          </div>
        )}
        {(state === 'missing' || state === 'installing') && !failedKind && (
          <ActionButton
            variant="outline"
            onClick={() => void start()}
            disabled={state === 'installing'}
            className="disabled:opacity-100"
          >
            {state === 'installing' ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin text-blue-500" />
            ) : (
              <Download className="w-3.5 h-3.5 mr-1.5" />
            )}
            {t('config.uvDownload')}
          </ActionButton>
        )}
        {state === 'missing' && failedKind && (
          <ActionButton variant="outline" onClick={() => void start()}>
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
            {t('config.uvRetry')}
          </ActionButton>
        )}
        {state === 'loading' && (
          <span className="text-body text-muted-foreground">
            {t('config.gitBashChecking')}
          </span>
        )}
      </SettingRow>

      {install?.status === 'running' && <InstallProgress install={install} />}
    </>
  );
};
