/**
 * @file components/phone/PhoneAppView.tsx
 * @description 手机屏内单个应用的打开态。顶栏返回键回桌面，Esc 是返回键的键盘等价物。
 * webview 元素命令式创建以避免 JSX 类型问题，加载与错误态沿用旧面板的画法。
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, RefreshCw } from 'lucide-react';
import { getBaseUrl } from '../../lib/api';
import { useAppPanelStore, type AppInfo } from '../../stores/appPanelStore';
import { useChatStore } from '../../stores/chatStore';
import { logger } from '../../lib/logger';

export function PhoneAppView({ app }: { app: AppInfo }) {
  const { t } = useTranslation();
  const selectApp = useAppPanelStore((s) => s.selectApp);
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
   * Esc 键是返回键的键盘等价物，桌面用户的快速退出通道。
   */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') selectApp(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectApp]);

  /**
   * 命令式创建 webview 元素，绑定加载与错误事件。
   * partition 必须在 src 之前赋值，应用的重启态由此持久化。
   * 当前 agent 与 session 作为 query 参数透传给 App，
   * 使其在用户首次操作时就具备发送 app 通知所需的上下文。
   * 依赖 baseUrl 与会话标识，任一变化都重建 webview。
   */
  useEffect(() => {
    if (!baseUrl || !containerRef.current) return;

    setIsLoading(true);
    setHasError(false);

    const ctx =
      agentId && currentSessionId
        ? `?agentId=${encodeURIComponent(agentId)}&sessionId=${encodeURIComponent(currentSessionId)}`
        : '';

    const wv = document.createElement('webview') as any;
    wv.partition = 'persist:apps';
    wv.src = `${baseUrl}/apps/${app.name}/${ctx}`;
    wv.style.width = '100%';
    wv.style.height = '100%';

    wv.addEventListener('did-finish-load', () => {
      setIsLoading(false);
      logger.info('PhonePanel: webview loaded', { app: app.name });
    });
    wv.addEventListener('did-fail-load', () => {
      setIsLoading(false);
      setHasError(true);
      logger.error('PhonePanel: webview failed to load', { app: app.name });
    });

    containerRef.current.innerHTML = '';
    containerRef.current.appendChild(wv);
    webviewRef.current = wv;

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
      webviewRef.current = null;
    };
  }, [app.name, baseUrl, agentId, currentSessionId]);

  const handleReload = () => {
    setHasError(false);
    setIsLoading(true);
    webviewRef.current?.reload();
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <div className="relative h-11 shrink-0 border-b border-border flex items-center justify-center">
        <button
          onClick={() => selectApp(null)}
          title={t('phone.back')}
          className="absolute left-1 h-9 px-2.5 flex items-center gap-0.5 rounded-lg text-[13px] font-medium text-[#228be6] hover:bg-black/[0.04] active:bg-black/[0.06] transition-colors"
        >
          <ChevronLeft className="w-[18px] h-[18px]" />
          {t('phone.back')}
        </button>
        <span className="max-w-[60%] text-[13px] font-semibold text-foreground truncate">
          {app.displayName}
        </span>
        <button
          onClick={handleReload}
          title="Reload"
          className="absolute right-1 p-1.5 rounded-lg hover:bg-black/[0.04] text-muted-foreground hover:text-foreground transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="flex-1 relative min-h-0 bg-white">
        <div ref={containerRef} className="absolute inset-0" />
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background">
            <div className="text-content text-muted-foreground animate-pulse">
              Loading...
            </div>
          </div>
        )}
        {hasError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-background">
            <span className="text-content text-muted-foreground">
              Failed to load app
            </span>
            <button
              onClick={handleReload}
              className="px-3 py-1 text-caption rounded border border-border hover:bg-muted"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
