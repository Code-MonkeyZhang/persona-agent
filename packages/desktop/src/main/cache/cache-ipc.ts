/**
 * @fileoverview 缓存库的 IPC 注册与更新推送。
 *
 * 读操作同步返回缓存数据，写操作落库后向全部窗口广播 CACHE_CHANGED，
 * 渲染层据此刷新列表与详情。异常以 invoke 拒绝的形式回到渲染层。
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IPC } from '@shared/channels';
import { CacheDb } from './cache-db';
import type { AgentConfig, SessionChange, SyncSnapshot } from '@persona/shared';

/** 注册缓存 IPC，并把缓存写后的通知接到全部窗口 */
export function registerCacheIpc(cache: CacheDb): void {
  cache.onChanged = () => {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC.CACHE_CHANGED);
    }
  };

  ipcMain.handle(IPC.CACHE_GET_SESSIONS, (_event, agentId: string) =>
    cache.listSessions(agentId)
  );
  ipcMain.handle(IPC.CACHE_GET_SESSION, (_event, sessionId: string) =>
    cache.getSession(sessionId)
  );
  ipcMain.handle(IPC.CACHE_GET_AGENTS, () => cache.listAgents());
  ipcMain.handle(IPC.CACHE_GET_CURSOR, () => cache.getCursor());
  ipcMain.handle(IPC.CACHE_APPLY_SNAPSHOT, (_event, snapshot: SyncSnapshot) => {
    cache.applySnapshot(snapshot);
  });
  ipcMain.handle(
    IPC.CACHE_APPLY_CHANGES,
    (_event, changes: SessionChange[]) => {
      cache.applyChanges(changes);
    }
  );
  ipcMain.handle(IPC.CACHE_PUT_AGENTS, (_event, agents: AgentConfig[]) => {
    cache.putAgents(agents);
  });
  ipcMain.handle(IPC.CACHE_DELETE_AGENT, (_event, agentId: string) => {
    cache.deleteAgent(agentId);
  });
  ipcMain.handle(IPC.CACHE_RESET, () => {
    cache.reset();
  });
}
