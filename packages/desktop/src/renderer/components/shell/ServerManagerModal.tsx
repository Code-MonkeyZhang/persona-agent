/**
 * @file src/renderer/components/shell/ServerManagerModal.tsx
 * @description 服务器管理弹窗，展示本地服务器状态和 Cloudflare 隧道控制
 */

import React from 'react';
import {
  X,
  Bot,
  Loader2,
  Globe,
  Cloud,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { useTunnelStore } from '../../stores/tunnelStore';
import { getBaseUrl } from '../../lib/api';
import type { ConnectionStatus } from '../../types/chat';
import { CopyButton } from '../ui/CopyButton';
import { StatusDot } from '../ui/StatusDot';

interface ServerManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionStatus: ConnectionStatus;
}

const serverStatusConfig: Record<
  ConnectionStatus,
  { labelKey: string; color: string; dotColor: string }
> = {
  connected: {
    labelKey: 'server.connected',
    color: 'text-green-600',
    dotColor: 'bg-green-500',
  },
  disconnected: {
    labelKey: 'server.disconnected',
    color: 'text-red-500',
    dotColor: 'bg-red-500',
  },
  connecting: {
    labelKey: 'server.connecting',
    color: 'text-yellow-500',
    dotColor: 'bg-yellow-500 animate-pulse',
  },
};

/**
 * 服务器管理弹窗组件，展示本地服务器连接状态和 Cloudflare 隧道控制
 */
export const ServerManagerModal: React.FC<ServerManagerModalProps> = ({
  isOpen,
  onClose,
  connectionStatus,
}) => {
  const { t } = useTranslation();
  if (!isOpen) return null;

  const config = serverStatusConfig[connectionStatus];

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 pt-6 pb-0">
            <div className="flex items-center justify-between">
              <h3 className="text-foreground">{t('server.title')}</h3>
              <button
                onClick={onClose}
                className="p-1 hover:bg-secondary rounded text-muted-foreground"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="mt-4 overflow-y-auto px-6 pb-6 space-y-5">
            <ServerSection
              connectionStatus={connectionStatus}
              config={config}
            />

            <div className="border-t border-border" />

            <TunnelSection connectionStatus={connectionStatus} />
          </div>
        </div>
      </div>
    </>
  );
};

/**
 * 服务器信息展示区，显示本地服务器连接状态和地址信息
 */
function ServerSection({
  connectionStatus,
  config,
}: {
  connectionStatus: ConnectionStatus;
  config: (typeof serverStatusConfig)[ConnectionStatus];
}) {
  const { t } = useTranslation();
  const [serverUrl, setServerUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (connectionStatus === 'connected') {
      getBaseUrl().then((url) => setServerUrl(url));
    } else {
      setServerUrl(null);
    }
  }, [connectionStatus]);

  return (
    <div className="flex items-center gap-3 rounded-[16px] border border-border p-4 bg-white">
      <div className="relative">
        {connectionStatus === 'connecting' ? (
          <Loader2 className="w-8 h-8 animate-spin text-yellow-500" />
        ) : (
          <Bot
            className={`w-8 h-8 ${
              connectionStatus === 'connected'
                ? 'text-green-500'
                : 'text-red-500'
            }`}
          />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-[15px] text-foreground">
          {t('server.agentServer')}
        </div>
        <div className="flex items-center gap-1.5 text-[14px] text-muted-foreground">
          <StatusDot color={config.dotColor} />
          <span className={config.color}>{t(config.labelKey)}</span>
        </div>
      </div>
      {connectionStatus === 'connected' && serverUrl && (
        <div className="flex items-center gap-2 shrink-0">
          <Globe className="w-4 h-4 text-blue-500" />
          <code className="text-[13px] bg-secondary px-2 py-1 rounded-[12px] text-foreground">
            {serverUrl}
          </code>
          <CopyButton text={serverUrl} />
        </div>
      )}
    </div>
  );
}

/**
 * Cloudflare 隧道控制区，提供隧道的启动、停止、健康状态展示和重试
 */
function TunnelSection({
  connectionStatus,
}: {
  connectionStatus: ConnectionStatus;
}) {
  const { t } = useTranslation();
  const { status, url, error, health, start, stop, refreshStatus } =
    useTunnelStore();

  React.useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const isEnabled = status === 'running' || status === 'starting';
  const isDisabled = connectionStatus !== 'connected';
  const isUnhealthy = status === 'running' && health === 'unhealthy';

  /**
   * 切换隧道启停状态
   */
  const handleToggle = () => {
    if (isEnabled) {
      stop();
    } else {
      start();
    }
  };

  /**
   * 重启隧道以获取新的公网地址
   */
  const handleRetry = () => {
    stop().then(() => start());
  };

  if (isDisabled) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-[14px] text-foreground">
              {t('server.remoteAccess')}
            </p>
            <p className="text-[13px] text-muted-foreground">
              {t('server.connectFirst')}
            </p>
          </div>
          <button
            disabled
            className="px-3 py-1.5 rounded-xl text-[13px] bg-foreground/10 text-foreground opacity-50 cursor-not-allowed"
          >
            {t('server.startTunnel')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-[14px] text-foreground">
            {t('server.remoteAccess')}
          </p>
          <p className="text-[13px] text-muted-foreground">
            {t('server.tunnelDesc')}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={status === 'starting'}
          className={`px-3 py-1.5 rounded-xl text-[13px] transition-colors ${
            status === 'running'
              ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
              : 'bg-foreground/10 text-foreground hover:bg-foreground/20'
          } disabled:opacity-50`}
        >
          {status === 'starting'
            ? t('server.tunnelConnecting')
            : isEnabled
              ? t('server.stopTunnel')
              : t('server.startTunnel')}
        </button>
      </div>

      {status === 'starting' && (
        <div className="rounded-[16px] border border-border p-3 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
          <span className="text-[14px] text-muted-foreground">
            {t('server.tunnelConnectingMsg')}
          </span>
        </div>
      )}

      {status === 'running' && url && isUnhealthy && (
        <div className="bg-orange-500/10 border border-orange-500/30 rounded-[16px] p-3 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
            <span className="text-[14px] text-orange-500">
              {t('server.tunnelUnreachable')}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <code className="text-[13px] bg-white px-2 py-1 rounded-[12px] text-orange-500">
              {url}
            </code>
            <button
              onClick={handleRetry}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl text-[13px] bg-orange-500/20 text-orange-500 hover:bg-orange-500/30 transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              {t('server.retry')}
            </button>
          </div>
        </div>
      )}

      {status === 'running' && url && !isUnhealthy && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-[16px] p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-green-500" />
              <span className="text-[14px] text-green-500">
                {t('server.publicUrl')}
              </span>
              <StatusDot color="bg-green-500" />
            </div>
            <div className="flex items-center gap-2">
              <code className="text-[13px] bg-white px-2 py-1 rounded-[12px] text-green-500">
                {url}
              </code>
              <CopyButton
                text={url}
                className="text-green-500/80 hover:text-green-500"
              />
            </div>
          </div>
          <div className="flex flex-col items-center gap-2 mt-3">
            <QRCodeSVG value={url} size={180} />
            <span className="text-[13px] text-muted-foreground">
              {t('server.scanToConnect')}
            </span>
          </div>
        </div>
      )}

      {status === 'error' && error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-[16px] p-3">
          <p className="text-[14px] text-red-500">
            {t('server.tunnelFailed')}: {error}
          </p>
        </div>
      )}
    </div>
  );
}
