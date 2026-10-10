/**
 * @fileoverview 连接状态横条的形态推导，纯函数无界面依赖。
 * 输入连接状态同步状态与绿闪标记，输出横条的可见性档位与 busy 来源，
 * 档位优先级 bad 压 busy 压 ok，语义对齐手机端 ConnectionBanner。
 */
import type { ConnectionStatus } from '../types/chat';
import type { SyncState } from './sync-engine';

/** 横条的三档形态，bad 是唯一实底态 */
export type ConnStripKind = 'ok' | 'busy' | 'bad';

/** busy 态的状态词来源，三值各配一条文案 */
export type ConnBusySource = 'connecting' | 'reconnecting' | 'syncing';

/** 横条的完整可视结论 */
export interface ConnStripView {
  visible: boolean;
  kind: ConnStripKind;
  busySource: ConnBusySource | null;
}

/**
 * 推导横条当前形态。
 * 连接与重连的窗口期取蓝档，追平期间取 syncing 蓝档，断开取红档，
 * 绿闪标记只在空闲时把横条顶成 ok 档，不盖过红蓝。
 */
export function deriveConnStrip(
  connectionStatus: ConnectionStatus,
  syncState: SyncState,
  flashActive: boolean
): ConnStripView {
  const busySource: ConnBusySource | null =
    connectionStatus === 'connecting'
      ? 'connecting'
      : connectionStatus === 'reconnecting'
        ? 'reconnecting'
        : syncState === 'syncing'
          ? 'syncing'
          : null;
  const isBad = connectionStatus === 'disconnected';
  const kind: ConnStripKind = isBad ? 'bad' : busySource ? 'busy' : 'ok';
  return {
    visible: !!(busySource || isBad || flashActive),
    kind,
    busySource,
  };
}

/**
 * 判断是否亮绿闪，只在亲眼看到连接中到在线的跃迁时亮一次。
 * 挂载即在线不亮，其他方向的跃迁不亮。
 */
export function shouldFlash(
  prev: ConnectionStatus,
  next: ConnectionStatus
): boolean {
  return (
    next === 'connected' && (prev === 'connecting' || prev === 'reconnecting')
  );
}
