/**
 * @file renderer/components/WebSocketProvider.tsx
 * @description WebSocket 连接生命周期管理组件 - 负责建立、维护和断开与服务端的 WebSocket 连接
 */

import { useEffect, useRef } from 'react';
import { WebSocketClient, getBaseUrl } from '../lib/api';
import { useChatStore } from '../stores/chatStore';
import { useTunnelStore } from '../stores/tunnelStore';
import { toast } from '../stores/toastStore';
import i18n from '../i18n';
import { logger } from '../lib/logger';

const DEVICE_ID_KEY = 'deviceId';

/**
 * 从 localStorage 获取或生成永久 deviceId。
 */
function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_KEY, id);
    logger.info(`[WebSocket] Generated new deviceId: ${id}`);
  }
  return id;
}

interface WebSocketProviderProps {
  children: React.ReactNode;
}

/**
 * 管理 WebSocket 连接生命周期，挂载时建立连接，卸载时断开连接。
 * 连接建立后自动注册设备身份，并监听手机上下线事件。
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

    const client = new WebSocketClient(getBaseUrl, {
      deviceId: getOrCreateDeviceId(),
      deviceType: 'desktop',
      deviceName: 'Desktop',
    });
    clientRef.current = client;

    unsubscribe = client.onMessage(handleWsMessage);

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
    });

    client.connect();

    return () => {
      unsubscribe?.();
      pairUnsubscribe?.();
      deviceUnsubscribe?.();
      connectionUnsubscribe?.();
      clientRef.current?.disconnect();
      clientRef.current = null;
      setWsClient(null);
    };
  }, [handleWsMessage, setConnectionStatus, setWsClient]);

  return <>{children}</>;
}
