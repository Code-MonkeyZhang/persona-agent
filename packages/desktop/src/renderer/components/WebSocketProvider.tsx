/**
 * @file renderer/components/WebSocketProvider.tsx
 * @description WebSocket 连接生命周期管理 - 客户端角随当前连接收数据，主机角独立连本机收配对与手机事件
 */
import { useEffect, useRef } from 'react';
import {
  WebSocketClient,
  getBaseUrl,
  getSyncSnapshot,
  getSyncChanges,
  invalidateBaseUrl,
} from '../lib/api';
import { SyncEngine } from '../lib/sync-engine';
import { useChatStore } from '../stores/chatStore';
import { useSessionStore } from '../stores/sessionStore';
import { useAgentStore } from '../stores/agentStore';
import { useTunnelStore } from '../stores/tunnelStore';
import { useConnectionStore } from '../stores/connectionStore';
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
 * 管理两条 WebSocket 连接生命周期。
 * 客户端角连当前连接，注册设备身份，同步引擎挂同一条连接，
 * 收到连接变更后断开重连，重连成功即走既有的追平路径。
 * 主机角独立连本机常驻服务端，不注册不随切换断开，
 * 只收配对提示与手机上下线事件，被人连的方向与当前连谁无关。
 */
export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const clientRef = useRef<WebSocketClient | null>(null);
  const handleWsMessage = useChatStore((state) => state.handleWsMessage);
  const setConnectionStatus = useChatStore(
    (state) => state.setConnectionStatus
  );
  const setWsClient = useChatStore((state) => state.setWsClient);

  // 客户端角：连当前连接，数据与同步的主通道
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let connectionUnsubscribe: (() => void) | undefined;
    let syncUnsubscribe: (() => void) | undefined;
    let hostChangeUnsubscribe: (() => void) | undefined;
    let cacheUnsubscribe: (() => void) | undefined;
    let cacheRefreshTimer: ReturnType<typeof setTimeout> | null = null;

    useConnectionStore.getState().init();

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
      if (msg.type !== 'change') return;
      engine.onChange(msg.change);
      // 事件体不带增量数据，整份重拉角色清单
      if (msg.change.kind === 'agents_invalidated') {
        void useAgentStore.getState().loadAgents();
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

    // 连接变更先断开旧连接，地址缓存回填后再重连，新地址由 urlProvider 重取
    hostChangeUnsubscribe = window.api?.onConnectionChanged((snapshot) => {
      logger.info(
        `[WebSocket] Following connection to ${snapshot.current.hostId}`
      );
      client.disconnect();
      void invalidateBaseUrl().then(() => {
        client.connect();
        void useAgentStore.getState().loadAgents();
      });
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
      syncUnsubscribe?.();
      connectionUnsubscribe?.();
      hostChangeUnsubscribe?.();
      cacheUnsubscribe?.();
      if (cacheRefreshTimer) clearTimeout(cacheRefreshTimer);
      clientRef.current?.disconnect();
      clientRef.current = null;
      setWsClient(null);
    };
  }, [handleWsMessage, setConnectionStatus, setWsClient]);

  // 主机角：独立连本机常驻服务端，只听不注册
  useEffect(() => {
    let pairUnsubscribe: (() => void) | undefined;
    let deviceUnsubscribe: (() => void) | undefined;

    const hostClient = new WebSocketClient(async () => {
      const snapshot = await window.api?.getConnection();
      // 本机未就绪时指向不可达地址，重连退避等它起来
      return snapshot?.local.address ?? 'http://localhost:0';
    });

    pairUnsubscribe = hostClient.onMessage((msg) => {
      if (msg.type === 'pair_request') {
        logger.info(`[WebSocket] PairRequest from ${msg.deviceName}`);
        toast.success(
          i18n.t('server.deviceConnected', { deviceName: msg.deviceName })
        );
      }
    });

    deviceUnsubscribe = hostClient.onMessage((msg) => {
      if (msg.type === 'device_online' && msg.device.deviceType === 'mobile') {
        logger.info(
          `[WebSocket] Mobile device online: ${msg.device.deviceName}`
        );
        useTunnelStore.getState().addMobileDevice(msg.device.deviceId);
      } else if (msg.type === 'device_offline') {
        useTunnelStore.getState().removeMobileDevice(msg.deviceId);
      }
    });

    hostClient.connect();

    return () => {
      pairUnsubscribe?.();
      deviceUnsubscribe?.();
      hostClient.disconnect();
    };
  }, []);

  return <>{children}</>;
}
