/**
 * @fileoverview Dream 调度器：周期性触发各 Agent 的记忆整理。
 *
 * 服务端启动时挂一个基础节拍，每个节拍遍历各 Agent，满足触发条件则
 * fire-and-forget 派发整理。上次整理时间用
 * 内存 Map 记录，重启重置——重启后首次到点会对有未处理料的 Agent 补跑。
 */

import { listAgentConfigs } from '../agent/index.js';
import { MemoryStore } from '../agent/memory/memory-store.js';
import { consolidateMemory } from './services/memory-service.js';
import type { AgentConfig } from '../agent/types.js';
import { Logger } from '../util/logger.js';

/** 基础节拍间隔 */
const TICK_INTERVAL_MS = 30 * 60 * 1000;
/** 一分钟的毫秒数 */
const MINUTE_MS = 60 * 1000;
/** 安全触发阈值：未处理条目数 ≥ 此值时无视间隔立即整理 */
const SAFETY_THRESHOLD = 50;

/** 各 Agent 上次真正派发整理的时间戳 */
const lastDreamAt = new Map<string, number>();

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * 判断某 Agent 当前是否应触发 Dream。
 *
 * - 无未处理料 → 否；
 * - 未处理条目数 ≥ {@link SAFETY_THRESHOLD} → 是；
 * - 否则 → 距上次整理已达 `dreamIntervalMinutes` 才触发。
 *
 * @param agentConfig - Agent 配置
 * @param lastDream - 上次真正派发整理的时间戳；0 表示从未整理过
 * @param now - 当前时间戳
 * @param unprocessedCount - dream_cursor 之后的未处理条目数
 * @returns 是否应触发整理
 */
export function shouldDream(
  agentConfig: Pick<AgentConfig, 'dreamIntervalMinutes'>,
  lastDream: number,
  now: number,
  unprocessedCount: number
): boolean {
  if (unprocessedCount === 0) return false;
  if (unprocessedCount >= SAFETY_THRESHOLD) return true;
  const intervalMs = agentConfig.dreamIntervalMinutes * MINUTE_MS;
  return now - lastDream >= intervalMs;
}

/**
 * 启动 Dream 调度器。
 *
 * 已在运行时重复调用是 no-op。每个节拍遍历各 Agent，满足 {@link shouldDream}
 * 条件则更新其上次整理时间并 fire-and-forget 派发 {@link consolidateMemory}。
 */
export function startDreamScheduler(): void {
  if (timer) return; // 防止重复启动
  // 首次立即跑一次，再按节拍循环
  tick();
  timer = setInterval(tick, TICK_INTERVAL_MS);
  Logger.log('DREAM', 'Scheduler started');
}

/** 单次节拍：遍历 Agent，满足条件则 fire-and-forget 派发整理 */
function tick(): void {
  const now = Date.now();
  for (const agent of listAgentConfigs()) {
    const store = new MemoryStore(agent.id);
    const unprocessed = store.readHistory(store.getDreamCursor()).length;
    const last = lastDreamAt.get(agent.id) ?? 0;
    if (!shouldDream(agent, last, now, unprocessed)) continue;

    // 仅在真正派发整理后更新，空跑 no-op 不"吃掉"间隔
    lastDreamAt.set(agent.id, now);
    // fire-and-forget：不 await，慢调用不阻塞其它 Agent
    consolidateMemory(agent).catch(() => {});
  }
}
