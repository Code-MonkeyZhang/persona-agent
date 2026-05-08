/**
 * @file renderer/components/WebSocketProvider.tsx
 * @description WebSocket 连接生命周期管理组件 - 负责建立、维护和断开与服务端的 WebSocket 连接
 */

import { useEffect, useRef } from 'react';
import { WebSocketClient, getBaseUrl } from '../lib/api';
import { useChatStore } from '../stores/chatStore';

interface WebSocketProviderProps {
  children: React.ReactNode;
}

/**
 * 管理 WebSocket 连接生命周期，挂载时建立连接，卸载时断开连接。
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

    const client = new WebSocketClient(getBaseUrl);
    clientRef.current = client;

    unsubscribe = client.onMessage(handleWsMessage);
    setWsClient(client);

    connectionUnsubscribe = client.onConnectionChange((connected) => {
      setConnectionStatus(connected ? 'connected' : 'disconnected');
    });

    client.connect();

    return () => {
      unsubscribe?.();
      connectionUnsubscribe?.();
      clientRef.current?.disconnect();
      clientRef.current = null;
      setWsClient(null);
    };
  }, [handleWsMessage, setConnectionStatus, setWsClient]);

  return <>{children}</>;
}
