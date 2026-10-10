/**
 * @file 会话侧栏的连接状态横条，手机端 ConnectionBanner 的桌面移植
 * 所有设备统一走连接状态机，本机只是握手更短，挂载即在线不重播绿闪
 * 全幅直角条不常驻，busy 浅底转圈，ok 浅绿底配勾，bad 实底红配白字点按重连
 * 进场淡入落位分档重播，出场压高收起，绿闪播完或状态回落即整体撤除
 * 连接好坏的常态由左下角设备图标承载，改地址不在横条里做走设备管理
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls } from 'framer-motion';
import { Check, Loader2, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { logger } from '../../lib/logger';
import { deriveConnStrip, shouldFlash } from '../../lib/connection-strip';
import { useChatStore } from '../../stores/chatStore';

/** 绿闪文案的停留时长，播完横条压高收起，对齐手机横幅的两秒闪现 */
const CONNECTED_FLASH_MS = 2000;

/** 进场落位时长，淡入加自上而下八像素 */
const ENTER_SEC = 0.25;

/** 压高收起时长，高度与透明度同走 */
const COLLAPSE_SEC = 0.3;

/** 三档样式映射，bad 是唯一实底态，对齐手机横幅的红蓝绿配法 */
const stripSkin: Record<'ok' | 'busy' | 'bad', string> = {
  ok: 'bg-green-500/10 text-green-600',
  busy: 'bg-primary/10 text-primary',
  bad: 'bg-destructive text-primary-foreground cursor-pointer hover:bg-destructive/90',
};

/** 三档的引导图标，busy 档额外加转圈 */
const stripIcon = { ok: Check, busy: Loader2, bad: WifiOff };

/** busy 三态的状态文案键，逐字对齐手机横幅 */
const busyTextKey = {
  connecting: 'device.connConnecting',
  reconnecting: 'device.connReconnecting',
  syncing: 'device.connSyncing',
} as const;

export function ConnectionStrip() {
  const { t } = useTranslation();
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const syncState = useChatStore((s) => s.syncState);

  /**
   * 绿闪只在亲眼看到 connecting 到 online 的跃迁时亮一次
   * 挂载时连接早已是好的不重播，中途回落让位其他形态
   */
  const [flashActive, setFlashActive] = useState(false);
  const prevStatusRef = useRef(connectionStatus);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = connectionStatus;
    if (shouldFlash(prev, connectionStatus)) {
      setFlashActive(true);
      logger.info('ConnectionStrip', 'connected flash');
      const timer = setTimeout(() => setFlashActive(false), CONNECTED_FLASH_MS);
      return () => clearTimeout(timer);
    }
    setFlashActive(false);
  }, [connectionStatus]);

  const { visible, kind, busySource } = deriveConnStrip(
    connectionStatus,
    syncState,
    flashActive
  );

  const text =
    kind === 'bad'
      ? t('device.connFailed')
      : busySource
        ? t(busyTextKey[busySource])
        : t('device.connConnected');

  const controls = useAnimationControls();

  // 分档切换时重播淡入落位，同档内换字不重播，挂载时同一处兼任进场
  useEffect(() => {
    controls.start(
      { y: [-8, 0], opacity: [0, 1] },
      { duration: ENTER_SEC, ease: 'easeOut' }
    );
  }, [kind, controls]);

  /** 在位到隐藏的翻转记一笔收起日志，挂在 cleanup 上避免 StrictMode 双跑误报 */
  useEffect(() => {
    if (!visible) return;
    return () => {
      logger.info('ConnectionStrip', 'collapsed');
    };
  }, [visible]);

  /** 红条点按跳过退避立即重连，客户端实例不在时静默 */
  const handleTap = () => {
    logger.info('ConnectionStrip', 'tap reconnect');
    useChatStore.getState().wsClient?.reconnectNow();
  };

  const Icon = stripIcon[kind];

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          key="conn-strip"
          className="overflow-hidden"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: COLLAPSE_SEC, ease: 'easeInOut' }}
        >
          <motion.div
            className={cn(
              'h-10 flex items-center gap-2 px-4 text-body font-semibold',
              stripSkin[kind]
            )}
            initial={false}
            animate={controls}
            onClick={kind === 'bad' ? handleTap : undefined}
          >
            <Icon
              className={cn(
                'w-4 h-4 shrink-0',
                kind === 'busy' && 'animate-spin'
              )}
            />
            <span className="flex-1 min-w-0 truncate">{text}</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
