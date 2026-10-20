/**
 * @fileoverview 会话同步引擎。
 *
 * 缓存库与服务端正本之间的单向追平器。冷启动游标为零先拉快照整体入库，
 * 之后分页拉变更流到服务端最新序号，推送模式下按序回放 WS 推来的单条变更。
 * 自愈一道，游标越过服务端头部说明序号流错位，整库作废重拉快照，
 * 覆盖同一身份下库文件被恢复到旧版本的场景，换主机的错配由 host-manager 在开库时处理。
 * 断线重连后重新走一遍追平。全部操作进同一条串行队列，
 * 追平的分页批次与推送的单条变更不会交错，游标始终单调前进。
 */

import type { SessionChange, SyncSnapshot } from '@persona/shared';
import { getErrorMessage } from './utils';

/** 追平分页上限 */
const PAGE_LIMIT = 500;

/** 追平过程的对外状态，横条的正在同步以此为准 */
export type SyncState = 'idle' | 'syncing';

/** 引擎的外部依赖，全部注入便于单测 */
export interface SyncDeps {
  /** 拉全量快照 */
  fetchSnapshot: () => Promise<SyncSnapshot>;
  /** 按游标分页拉变更，返回按序变更与服务端最新序号 */
  fetchChanges: (
    since: number,
    limit: number
  ) => Promise<{ changes: SessionChange[]; head: number }>;
  /** 读本地缓存游标 */
  getCursor: () => Promise<number>;
  /** 作废本地镜像整库清空，随后走快照整库重建 */
  invalidateMirror: () => Promise<void>;
  /** 快照整体入库 */
  applySnapshot: (snapshot: SyncSnapshot) => Promise<void>;
  /** 变更批量回放入库 */
  applyChanges: (changes: SessionChange[]) => Promise<void>;
  /** 追平状态回调，入队发 syncing，收尾发 idle，单条回放不触发 */
  onStateChange: (state: SyncState) => void;
  /** 结构化日志 */
  log: (message: string) => void;
}

/** 会话同步引擎，依赖全注入的纯 TS 模块 */
export class SyncEngine {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly deps: SyncDeps) {}

  /** 追平到服务端最新，连接建立与重连时调用，周期对外发 syncing 到 idle */
  sync(): void {
    this.deps.onStateChange('syncing');
    void this.enqueue(() =>
      this.catchUp().finally(() => this.deps.onStateChange('idle'))
    );
  }

  /** 回放推送来的单条变更 */
  onChange(change: SessionChange): void {
    void this.enqueue(() => this.deps.applyChanges([change]));
  }

  /**
   * 串行队列，前一项失败不阻断后一项。
   * 队列本身吞掉错误并落日志，调用方无需感知失败。
   */
  private enqueue(work: () => Promise<void>): Promise<void> {
    const run = async (): Promise<void> => {
      try {
        await work();
      } catch (error) {
        this.deps.log(`Sync failed: ${getErrorMessage(error)}`);
      }
    };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }

  /** 追平主流程：先镜像再分页拉平 */
  private async catchUp(): Promise<void> {
    let cursor = await this.deps.getCursor();

    if (cursor === 0) {
      cursor = await this.mirrorSnapshot();
    }

    for (;;) {
      const { changes, head } = await this.deps.fetchChanges(
        cursor,
        PAGE_LIMIT
      );
      // 游标越过服务端头部，序号流已错位，作废重建后重新对表
      if (cursor > head) {
        this.deps.log(
          `Cursor ${cursor} beyond server head ${head}, re-mirroring`
        );
        await this.deps.invalidateMirror();
        cursor = await this.mirrorSnapshot();
        continue;
      }
      if (changes.length === 0) break;
      await this.deps.applyChanges(changes);
      cursor = changes[changes.length - 1].seq;
      if (head <= cursor) break;
    }
  }

  /** 拉快照整体入库，返回快照时刻的最新序号，冷启动与游标错位共用 */
  private async mirrorSnapshot(): Promise<number> {
    const snapshot = await this.deps.fetchSnapshot();
    await this.deps.applySnapshot(snapshot);
    this.deps.log(
      `Mirrored snapshot: ${snapshot.sessions.length} sessions latestSeq=${snapshot.latestSeq}`
    );
    return snapshot.latestSeq;
  }
}
