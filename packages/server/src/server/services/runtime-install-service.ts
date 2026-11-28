/**
 * @fileoverview 工具运行环境安装服务。
 *
 * 同一时间只跑一个安装，进行到哪一步、收了多少字节都记在这里，路由和广播都从这里读。
 * 照 tunnel-service 的样子写成模块级函数加模块级状态。
 *
 * 进度经 WebSocket 的 runtime_install 事件广播给所有在线的客户端，手机端不认识这个类型会直接忽略。
 * 发起时先把状态变成进行中并广播，再开始安装。瞬间就失败的安装也走出从进行中到失败的路，界面上的提示一定弹得出来。
 */

import type { RuntimeInstallState, RuntimeInstallStep } from '@persona/shared';
import { broadcastToAll } from '../websocket-server.js';
import { InstallError, UvInstaller } from '../../util/uv-installer.js';
import { invalidateUvCache } from '../../util/uv-runtime.js';
import { Logger } from '../../util/logger.js';

/** 同一步里两次进度广播之间的最小间隔，换步骤和结束不受它限制 */
const PROGRESS_INTERVAL_MS = 100;

let current: RuntimeInstallState | null = null;
let lastBroadcastAt = 0;

/** 当前安装状态的副本，null 表示既没有进行中的安装也没有失败的记录 */
export function getRuntimeInstall(): RuntimeInstallState | null {
  return current ? { ...current } : null;
}

function broadcast(): void {
  broadcastToAll({ type: 'runtime_install', install: getRuntimeInstall() });
}

/**
 * 发起一次安装，立刻返回当前的进度。
 * 已经有安装在跑时这次发起被忽略，返回的是那个安装的进度，不会启动第二个。
 */
export function startRuntimeInstall(): RuntimeInstallState {
  if (current?.status === 'running') {
    Logger.log('RUNTIME', 'Install already running, request ignored');
    return { ...current };
  }

  Logger.log('RUNTIME', 'Install requested');
  const installer = new UvInstaller(track);
  // 先广播一条进行中再开始安装
  const started = track('uv', 0, null);
  installer.run().then(onSucceeded, onFailed);
  return started;
}

/**
 * 安装器的每一次进度都走这里，返回更新后的状态。
 * 同一步里的进度按间隔节流，换了步骤立即广播，界面看不出差别，连接和日志也不被刷屏。
 */
function track(
  step: RuntimeInstallStep,
  received: number,
  total: number | null
): RuntimeInstallState {
  const stepChanged = current?.status !== 'running' || current.step !== step;
  current = { status: 'running', step, received, total };

  const now = Date.now();
  if (stepChanged || now - lastBroadcastAt >= PROGRESS_INTERVAL_MS) {
    lastBroadcastAt = now;
    broadcast();
  }
  return { ...current };
}

/** 安装成功。清掉进行中的状态，让检测结果失效，下一次查询重新检测。 */
function onSucceeded(): void {
  current = null;
  invalidateUvCache();
  Logger.log('RUNTIME', 'Install succeeded');
  broadcast();
}

/** 安装失败。状态停在失败并带着类别，直到下次发起或者应用重启。 */
function onFailed(err: unknown): void {
  const kind = err instanceof InstallError ? err.kind : 'local';
  Logger.critical('RUNTIME', `Install failed, kind=${kind}`, err);
  current = {
    status: 'failed',
    step: current?.step ?? 'uv',
    received: current?.received ?? 0,
    total: current?.total ?? null,
    error: kind,
  };
  broadcast();
}

/** Reset internal state, used only by tests. */
export function _resetState(): void {
  current = null;
  lastBroadcastAt = 0;
}
