/**
 * @fileoverview 缓存库的 IPC 注册与更新推送。
 *
 * 注册一次不随切换重建，handler 内部经 getter 取当前库实例，
 * 切换窗口期取不到实例时读返回空值写丢弃并落日志。
 * 同步写入携带数据来源主机身份，与活动库来源不符时丢弃，
 * 切换微窗口里旧连接的残留推送走这条拒写路径。
 * 读操作同步返回缓存数据，写操作落库后向全部窗口广播 CACHE_CHANGED，
 * 渲染层据此刷新列表与详情。异常以 invoke 拒绝的形式回到渲染层。
 */

import { ipcMain } from 'electron';
import log from 'electron-log';
import { IPC } from '@shared/channels';
import type { CacheDb } from './cache-db';
import type { AgentConfig, SessionChange, SyncSnapshot } from '@persona/shared';

/** 注册缓存 IPC，cacheGetter 每次调用返回当前连接的镜像库 */
export function registerCacheIpc(cacheGetter: () => CacheDb | null): void {
  /** 写操作在库不可用时丢弃并落日志，切换完成后由追平路径补齐 */
  const dropWrite = (channel: string): void => {
    log.warn(`[cache-ipc] Dropped ${channel}, cache unavailable`);
  };

  /** 来源身份与活动库不符的同步写入丢弃，防切换微窗口的错库污染 */
  const dropWrongHost = (
    channel: string,
    source: string,
    active: string
  ): void => {
    log.warn(
      `[cache-ipc] Dropped ${channel}, source ${source} does not match active ${active}`
    );
  };

  ipcMain.handle(
    IPC.CACHE_GET_SESSIONS,
    (_event, agentId: string) => cacheGetter()?.listSessions(agentId) ?? []
  );
  ipcMain.handle(
    IPC.CACHE_GET_SESSION,
    (_event, sessionId: string) => cacheGetter()?.getSession(sessionId) ?? null
  );
  ipcMain.handle(IPC.CACHE_GET_AGENTS, () => cacheGetter()?.listAgents() ?? []);
  ipcMain.handle(
    IPC.CACHE_GET_UNREAD_AGENTS,
    () => cacheGetter()?.listUnreadAgentIds() ?? []
  );
  ipcMain.handle(
    IPC.CACHE_GET_LAUNCHER_PREFS,
    () => cacheGetter()?.getLauncherPrefs() ?? null
  );
  ipcMain.handle(IPC.CACHE_GET_CURSOR, () => cacheGetter()?.getCursor() ?? 0);
  ipcMain.handle(
    IPC.CACHE_APPLY_SNAPSHOT,
    (_event, snapshot: SyncSnapshot, sourceHostId: string) => {
      const cache = cacheGetter();
      if (!cache) {
        dropWrite('applySnapshot');
        return;
      }
      if (cache.sourceHost !== sourceHostId) {
        dropWrongHost('applySnapshot', sourceHostId, cache.sourceHost);
        return;
      }
      cache.applySnapshot(snapshot);
    }
  );
  ipcMain.handle(
    IPC.CACHE_APPLY_CHANGES,
    (_event, changes: SessionChange[], sourceHostId: string) => {
      const cache = cacheGetter();
      if (!cache) {
        dropWrite('applyChanges');
        return;
      }
      if (cache.sourceHost !== sourceHostId) {
        dropWrongHost('applyChanges', sourceHostId, cache.sourceHost);
        return;
      }
      cache.applyChanges(changes);
    }
  );
  ipcMain.handle(IPC.CACHE_PUT_AGENTS, (_event, agents: AgentConfig[]) => {
    const cache = cacheGetter();
    if (!cache) {
      dropWrite('putAgents');
      return;
    }
    cache.putAgents(agents);
  });
  ipcMain.handle(IPC.CACHE_DELETE_AGENT, (_event, agentId: string) => {
    const cache = cacheGetter();
    if (!cache) {
      dropWrite('deleteAgent');
      return;
    }
    cache.deleteAgent(agentId);
  });
  ipcMain.handle(IPC.CACHE_RESET, () => {
    const cache = cacheGetter();
    if (!cache) {
      dropWrite('reset');
      return;
    }
    cache.reset();
  });
}
