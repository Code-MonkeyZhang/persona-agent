/**
 * @file src/renderer/components/ServerManagerModal.tsx
 * @description 服务器管理弹窗，展示本地服务器状态和 Cloudflare 隧道控制
 */

import React from 'react';
import { X, Server, Loader2, Copy, Check, Globe } from 'lucide-react';
import { useTunnelStore } from '../stores/tunnelStore';
import { getBaseUrl } from '../lib/api';

type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface ServerManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  connectionStatus: ConnectionStatus;
}

const serverStatusConfig: Record<
  ConnectionStatus,
  { label: string; color: string; dotColor: string }
> = {
  connected: {
    label: '已连接',
    color: 'text-green-600',
    dotColor: 'bg-green-500',
  },
  disconnected: {
    label: '未连接',
    color: 'text-red-500',
    dotColor: 'bg-red-500',
  },
  connecting: {
    label: '连接中',
    color: 'text-yellow-500',
    dotColor: 'bg-yellow-500 animate-pulse',
  },
};

/**
 * 服务器管理弹窗组件，展示本地服务器连接状态和远程隧道控制
 */
export const ServerManagerModal: React.FC<ServerManagerModalProps> = ({
  isOpen,
  onClose,
  connectionStatus,
}) => {
  if (!isOpen) return null;

  const config = serverStatusConfig[connectionStatus];

  return (
    <>
      <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-5 h-5" />
              <h3 className="font-medium">服务器管理</h3>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
            <ServerSection
              connectionStatus={connectionStatus}
              config={config}
            />
            <div className="border-t" />
            <TunnelSection connectionStatus={connectionStatus} />
          </div>
        </div>
      </div>
    </>
  );
};

/**
 * 服务器信息展示区，显示本地服务器连接状态和地址
 */
function ServerSection({
  connectionStatus,
  config,
}: {
  connectionStatus: ConnectionStatus;
  config: (typeof serverStatusConfig)[ConnectionStatus];
}) {
  const [serverUrl, setServerUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (connectionStatus === 'connected') {
      getBaseUrl().then((url) => setServerUrl(url));
    } else {
      setServerUrl(null);
    }
  }, [connectionStatus]);

  return (
    <div className="flex items-center gap-3 rounded-lg border p-4">
      <div className="relative">
        {connectionStatus === 'connecting' ? (
          <Loader2 className="w-7 h-7 animate-spin text-yellow-500" />
        ) : (
          <Server
            className={`w-7 h-7 ${
              connectionStatus === 'connected'
                ? 'text-green-500'
                : 'text-red-500'
            }`}
          />
        )}
      </div>
      <div>
        <div className="font-medium text-sm">本地服务器</div>
        <div className="flex items-center gap-1.5 text-sm text-gray-500">
          <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
          <span className={config.color}>{config.label}</span>
        </div>
      </div>
      {connectionStatus === 'connected' && serverUrl && (
        <div className="ml-auto flex items-center gap-2">
          <code className="text-xs bg-gray-100 px-2 py-1 rounded text-gray-600">
            {serverUrl}
          </code>
          <CopyButton text={serverUrl} />
        </div>
      )}
    </div>
  );
}

/**
 * 远程隧道控制区，提供 Cloudflare 隧道的启动、停止和状态展示
 */
function TunnelSection({
  connectionStatus,
}: {
  connectionStatus: ConnectionStatus;
}) {
  const { status, url, error, start, stop, refreshStatus } = useTunnelStore();

  React.useEffect(() => {
    refreshStatus();
  }, [refreshStatus]);

  const isEnabled = status === 'running' || status === 'starting';
  const isDisabled = connectionStatus !== 'connected';

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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-sm">远程访问</p>
          <p className="text-xs text-gray-500">
            通过 Cloudflare 隧道获取公网地址
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={status === 'starting' || isDisabled}
          className={`px-3 py-1.5 rounded-lg text-xs transition-colors ${
            isEnabled
              ? 'bg-red-500/10 text-red-600 hover:bg-red-500/20'
              : 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20'
          } disabled:opacity-50`}
        >
          {status === 'starting'
            ? '连接中...'
            : isEnabled
              ? '停止隧道'
              : '启动隧道'}
        </button>
      </div>

      {status === 'starting' && (
        <div className="rounded-lg border p-3 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
          <span className="text-sm text-gray-500">
            正在建立隧道连接，请稍候...
          </span>
        </div>
      )}

      {status === 'running' && url && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700">公网地址</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-xs bg-white px-2 py-1 rounded text-green-700">
                {url}
              </code>
              <CopyButton text={url} />
            </div>
          </div>
        </div>
      )}

      {status === 'error' && error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <p className="text-sm text-red-600">隧道连接失败: {error}</p>
        </div>
      )}

      {isDisabled && (
        <p className="text-xs text-gray-400">请先确保本地服务器已连接</p>
      )}
    </div>
  );
}

/**
 * 复制按钮组件，点击后将文本写入剪贴板并短暂显示勾选图标
 * @param text 待复制的文本内容
 */
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = React.useState(false);

  /**
   * 将文本写入系统剪贴板，2 秒后恢复按钮状态
   */
  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="text-gray-400 hover:text-gray-600 transition-colors"
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-500" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}
