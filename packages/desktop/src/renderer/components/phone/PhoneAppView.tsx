/**
 * @file components/phone/PhoneAppView.tsx
 * @description 手机屏内单个应用的打开态。顶栏走 PhoneAppBar，返回钮与 Esc 都回桌面。
 * webview 元素命令式创建以避免 JSX 类型问题，加载与错误态由顶栏 footer 的进度线与红条承载。
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { getBaseUrl } from '../../lib/api';
import { useAppPanelStore, type AppInfo } from '../../stores/appPanelStore';
import { useChatStore } from '../../stores/chatStore';
import { logger } from '../../lib/logger';
import { PhoneAppBar } from './PhoneAppBar';

/**
 * 顶栏下的游走进度线。滑块以自身宽度为基准循环平移，
 * 与加载进度数值无关，只在途与不在途两种观感。
 */
function ProgressLine() {
  return (
    <div className="h-[2.5px] mx-3.5 rounded-[2px] bg-[rgba(22,32,46,0.08)] overflow-hidden">
      <motion.div
        className="h-full w-[38%] rounded-[2px] bg-primary"
        animate={{ x: ['-100%', '263%'] }}
        transition={{ duration: 1.1, ease: 'easeInOut', repeat: Infinity }}
      />
    </div>
  );
}

/** 顶栏下的失败红条，点按整条触发重载 */
function ErrorStrip({
  text,
  onReload,
}: {
  text: string;
  onReload: () => void;
}) {
  return (
    <div
      onClick={onReload}
      className="min-h-[52px] bg-[#ff4444] flex items-center gap-2 px-4 py-2 cursor-pointer"
    >
      <WifiOff className="w-[18px] h-[18px] shrink-0 text-white" />
      <span className="flex-1 text-[14px] font-semibold text-white">
        {text}
      </span>
    </div>
  );
}

/** 药丸迷你图标，logo 铺满，缺图回退应用名首字 */
function MiniAppTile({ app }: { app: AppInfo }) {
  return (
    <div className="relative w-6 h-6 rounded-[6px] shrink-0 overflow-hidden flex items-center justify-center bg-white border border-[rgba(22,32,46,0.10)]">
      <span className="text-[10px] font-semibold text-muted-foreground">
        {app.displayName.charAt(0)}
      </span>
      {app.logoUrl && (
        <img
          src={app.logoUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = 'none';
          }}
        />
      )}
    </div>
  );
}

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

  /** 返回钮与 Esc 同指桌面，共用一个出口并落日志 */
  const handleBackToHome = () => {
    logger.info('PhonePanel: app bar back to home', { app: app.name });
    selectApp(null);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleBackToHome();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleBackToHome]);

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

  /** 红条点按重载，进度线随之复位 */
  const handleReload = () => {
    logger.info('PhonePanel: reload from error strip', { app: app.name });
    setHasError(false);
    setIsLoading(true);
    webviewRef.current?.reload();
  };

  return (
    <div className="h-full flex flex-col bg-background">
      <PhoneAppBar
        title={app.displayName}
        tile={<MiniAppTile app={app} />}
        onBack={handleBackToHome}
        footer={
          isLoading ? (
            <ProgressLine />
          ) : hasError ? (
            <ErrorStrip
              text={t('phone.pageLoadFailed')}
              onReload={handleReload}
            />
          ) : undefined
        }
      />
      <div className="flex-1 relative min-h-0 bg-white">
        <div ref={containerRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
