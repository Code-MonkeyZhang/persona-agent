/**
 * @file src/renderer/components/ServerManagerModal.tsx
 * @description 服务器管理弹窗，展示本地服务器状态和 Cloudflare 隧道控制
 */

import React from 'react';
import {
  X,
  Server,
  Bot,
  Loader2,
  Copy,
  Check,
  Globe,
  Cloud,
} from 'lucide-react';
import { useTunnelStore } from '../stores/tunnelStore';
import { getBaseUrl } from '../lib/api';
import { InfoRow } from './InfoRow';
import type { ConnectionStatus } from '../types/chat';

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
 * 服务器管理弹窗组件，展示本地服务器连接状态和 Cloudflare 隧道控制
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
          className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-6 pt-6 pb-0">
            <div className="flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-[#333]">
                <Server className="w-5 h-5" />
                服务器管理
              </h3>
              <button
                onClick={onClose}
                className="p-1 hover:bg-[#f0f0f0] rounded text-[#999]"
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

            <div className="border-t border-[#f0f0f0]" />

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
  const [serverUrl, setServerUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (connectionStatus === 'connected') {
      getBaseUrl().then((url) => setServerUrl(url));
    } else {
      setServerUrl(null);
    }
  }, [connectionStatus]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 rounded-[16px] border border-[#f0f0f0] p-4 bg-white">
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
        <div>
          <div className="font-medium text-[15px] text-[#333]">
            Agent 服务器
          </div>
          <div className="flex items-center gap-1.5 text-[14px] text-[#666]">
            <span className={`w-2 h-2 rounded-full ${config.dotColor}`} />
            <span className={config.color}>{config.label}</span>
          </div>
        </div>
      </div>

      {connectionStatus === 'connected' && serverUrl && (
        <div className="rounded-[16px] border border-[#f0f0f0] p-4 space-y-3 bg-white">
          <div className="text-[13px] font-medium text-[#999] mb-2">
            服务器信息
          </div>
          <InfoRow
            icon={<Globe className="w-4 h-4 text-blue-500" />}
            label="地址"
            value={serverUrl}
            copyable
          />
        </div>
      )}
    </div>
  );
}

/**
 * Cloudflare 隧道控制区，提供隧道的启动、停止和状态展示
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

  if (isDisabled) {
    return (
      <div>
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-[14px] text-[#333]">互联网访问</p>
            <p className="text-[13px] text-[#999]">请先连接服务器</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="font-medium text-[14px] text-[#333]">互联网访问</p>
          <p className="text-[13px] text-[#999]">
            通过 Cloudflare 隧道获取公网地址
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={status === 'starting'}
          className={`px-3 py-1.5 rounded-xl text-[13px] transition-colors ${
            status === 'running'
              ? 'bg-red-500/20 text-red-500 hover:bg-red-500/30'
              : 'bg-[#222]/10 text-[#333] hover:bg-[#222]/20'
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
        <div className="rounded-[16px] border border-[#f0f0f0] p-3 flex items-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-yellow-500" />
          <span className="text-[14px] text-[#666]">
            正在建立隧道连接，请稍候...
          </span>
        </div>
      )}

      {status === 'running' && url && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-[16px] p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="w-4 h-4 text-green-500" />
              <span className="text-[14px] text-green-500">公网地址</span>
            </div>
            <div className="flex items-center gap-2">
              <code className="text-[13px] bg-white px-2 py-1 rounded-[12px] text-green-500">
                {url}
              </code>
              <CopyButton text={url} />
            </div>
          </div>
        </div>
      )}

      {status === 'error' && error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-[16px] p-3">
          <p className="text-[14px] text-red-500">隧道连接失败: {error}</p>
        </div>
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
    <button onClick={handleCopy} className="text-[#999] hover:text-[#333]">
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-500" />
      ) : (
        <Copy className="w-3.5 h-3.5" />
      )}
    </button>
  );
}
