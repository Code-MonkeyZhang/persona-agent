/**
 * @file src/renderer/components/AppWebViewPanel.tsx
 * @description Agent App 的 WebView 面板。通过反向代理加载 App 的 Web UI，
 * 支持加载态、错误态和重试。webview 元素通过命令式 API 创建以避免 JSX 类型问题。
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { getBaseUrl } from '../lib/api';
import { useAppPanelStore } from '../stores/appPanelStore';
import { useChatStore } from '../stores/chatStore';
import { logger } from '../lib/logger';

export const AppWebViewPanel: React.FC = () => {
  const selectedApp = useAppPanelStore((s) => s.selectedApp);
  const collapsePanel = useAppPanelStore((s) => s.collapsePanel);
  const agentId = useChatStore((s) => s.agentId);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const [baseUrl, setBaseUrl] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    void getBaseUrl().then(setBaseUrl);
  }, []);

  /**
   * 命令式创建 webview 元素，绑定加载/错误事件。
   * 把当前 agent/session 作为 query 参数透传给 App，使其能在用户首次操作
   * （如点击"开始游戏"）时就具备发送 app 通知所需的上下文。
   * 依赖 selectedApp、baseUrl、agent、session，任一变化都重建 webview。
   */
  useEffect(() => {
    if (!selectedApp || !baseUrl || !containerRef.current) return;

    setIsLoading(true);
    setHasError(false);

    const ctx =
      agentId && currentSessionId
        ? `?agentId=${encodeURIComponent(agentId)}&sessionId=${encodeURIComponent(currentSessionId)}`
        : '';

    const wv = document.createElement('webview') as any;
    wv.src = `${baseUrl}/apps/${selectedApp}/${ctx}`;
    wv.style.width = '100%';
    wv.style.height = '100%';

    wv.addEventListener('did-finish-load', () => {
      setIsLoading(false);
      logger.info('AppPanel: webview loaded', { app: selectedApp });
    });
    wv.addEventListener('did-fail-load', () => {
      setIsLoading(false);
      setHasError(true);
      logger.error('AppPanel: webview failed to load', { app: selectedApp });
    });

    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(wv);
    webviewRef.current = wv;

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
      webviewRef.current = null;
    };
  }, [selectedApp, baseUrl, agentId, currentSessionId]);

  if (!selectedApp) return null;

  const handleReload = () => {
    setHasError(false);
    setIsLoading(true);
    webviewRef.current?.reload();
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="h-14 flex items-center justify-between px-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {baseUrl && (
            <img
              src={`${baseUrl}/apps/${selectedApp}/icon.png`}
              alt={selectedApp}
              className="w-7 h-7 rounded-md object-cover shrink-0"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
          )}
          <span className="font-medium text-[15px] text-foreground truncate">
            {selectedApp
              .split('-')
              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
              .join(' ')}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={handleReload}
            className="p-1 rounded hover:bg-muted"
            title="Reload"
          >
            <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={collapsePanel}
            className="p-1 rounded hover:bg-muted"
            title="Collapse"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        </div>
      </div>
      <div className="flex-1 relative min-h-0">
        <div ref={containerRef} className="absolute inset-0" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <div className="text-sm text-muted-foreground animate-pulse">
              Loading...
            </div>
          </div>
        )}
        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background">
            <span className="text-sm text-muted-foreground">
              Failed to load app
            </span>
            <button
              onClick={handleReload}
              className="px-3 py-1 text-xs rounded border border-border hover:bg-muted"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
