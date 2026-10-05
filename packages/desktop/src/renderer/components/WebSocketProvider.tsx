/**
 * @file renderer/components/WebSocketProvider.tsx
 * @description WebSocket 连接生命周期管理组件 - 负责建立、维护和断开与服务端的 WebSocket 连接
 */

import { useEffect, useRef } from 'react';
import {
  WebSocketClient,
  getBaseUrl,
  getSyncSnapshot,
  getSyncChanges,
} from '../lib/api';
import { SyncEngine } from '../lib/sync-engine';
import { useChatStore } from '../stores/chatStore';
import { useSessionStore } from '../stores/sessionStore';
import { useTunnelStore } from '../stores/tunnelStore';
import { toast } from '../stores/toastStore';
import i18n from '../i18n';
import { logger } from '../lib/logger';
import { getOrCreateDeviceId } from '../lib/device-id';

/** 缓存更新驱动界面刷新的去抖间隔 */
const CACHE_REFRESH_DEBOUNCE_MS = 300;

interface WebSocketProviderProps {
  children: React.ReactNode;
}

/**
 * 管理 WebSocket 连接生命周期，挂载时建立连接，卸载时断开连接。
 * 连接建立后自动注册设备身份，监听手机上下线事件。
 * 同步引擎挂同一条连接：建立时追平缓存，change 推送交给引擎回放。
 * 缓存更新事件驱动会话与消息刷新。
 */
export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const clientRef = useRef<WebSocketClient | null>(null);
  const handleWsMessage = useChatStore((state) => state.handleWsMessage);
  const setConnectionStatus = useChatStore(
    (state) => state.setConnectionStatus
  );
  const setWsClient = useChatStore((state) => state.setWsClient);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let connectionUnsubscribe: (() => void) | undefined;
    let pairUnsubscribe: (() => void) | undefined;
    let deviceUnsubscribe: (() => void) | undefined;
    let syncUnsubscribe: (() => void) | undefined;
    let cacheUnsubscribe: (() => void) | undefined;
    let cacheRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    const client = new WebSocketClient(getBaseUrl, {
      deviceId: getOrCreateDeviceId(),
      deviceType: 'desktop',
      deviceName: 'Desktop',
    });
    clientRef.current = client;

    const engine = new SyncEngine({
      fetchSnapshot: getSyncSnapshot,
      fetchChanges: getSyncChanges,
      getCursor: () => window.api?.cache.getCursor() ?? Promise.resolve(0),
      applySnapshot: (snapshot) =>
        window.api?.cache.applySnapshot(snapshot) ?? Promise.resolve(),
      applyChanges: (changes) =>
        window.api?.cache.applyChanges(changes) ?? Promise.resolve(),
      log: (message) => logger.info(`[Sync] ${message}`),
    });

    unsubscribe = client.onMessage(handleWsMessage);

    syncUnsubscribe = client.onMessage((msg) => {
      if (msg.type === 'change') {
        engine.onChange(msg.change);
      }
    });

    pairUnsubscribe = client.onMessage((msg) => {
      if (msg.type === 'pair_request') {
        logger.info(`[WebSocket] PairRequest from ${msg.deviceName}`);
        toast.success(
          i18n.t('server.deviceConnected', { deviceName: msg.deviceName })
        );
      }
    });

    deviceUnsubscribe = client.onMessage((msg) => {
      if (msg.type === 'device_online' && msg.device.deviceType === 'mobile') {
        logger.info(
          `[WebSocket] Mobile device online: ${msg.device.deviceName}`
        );
        useTunnelStore.getState().addMobileDevice(msg.device.deviceId);
      } else if (msg.type === 'device_offline') {
        useTunnelStore.getState().removeMobileDevice(msg.deviceId);
      }
    });

    setWsClient(client);

    connectionUnsubscribe = client.onConnectionChange((connected) => {
      setConnectionStatus(connected ? 'connected' : 'disconnected');
      // 连接建立即追平，重连与首次连接走同一条路
      if (connected) {
        engine.sync();
      }
    });

    // 缓存更新驱动界面刷新，去抖合并写风暴，生成中的会话跳过消息重载
    cacheUnsubscribe = window.api?.cache.onChanged(() => {
      if (cacheRefreshTimer) clearTimeout(cacheRefreshTimer);
      cacheRefreshTimer = setTimeout(() => {
        const sessionState = useSessionStore.getState();
        const chatState = useChatStore.getState();
        const current = sessionState.currentSession;
        const generating = current
          ? chatState.sessionStates.get(current.id)?.isLoading
          : false;
        void (async () => {
          await sessionState.refreshFromCache(!generating);
          if (!current || generating) return;
          chatState.refreshSessionMessages(current.id);
        })();
      }, CACHE_REFRESH_DEBOUNCE_MS);
    });

    client.connect();

    return () => {
      unsubscribe?.();
      pairUnsubscribe?.();
      deviceUnsubscribe?.();
      syncUnsubscribe?.();
      connectionUnsubscribe?.();
      cacheUnsubscribe?.();
      if (cacheRefreshTimer) clearTimeout(cacheRefreshTimer);
      clientRef.current?.disconnect();
      clientRef.current = null;
      setWsClient(null);
    };
  }, [handleWsMessage, setConnectionStatus, setWsClient]);

  return <>{children}</>;
}
