/**
 * @fileoverview 上下文占用服务：报数对账、底数落账、两轨分子算法、快照拼装与统一推送出口。
 *
 * 分子分两条轨取数。有底数走真实轨，底数减报数时装配加现行装配加锚点后持久
 * 消息估算加压缩净调整，返回前零钳制。无底数走估算轨，现行装配估算加全部持久
 * 消息估算。分母是模型上下文窗口，不落库不写死。估算也失败即模型查不到注册表，
 * 快照为 null，那是唯一的图标壳场景。
 */

import type { Usage } from '@earendil-works/pi-ai';
import type {
  AgentConfig,
  BreakdownShares,
  Session,
  UsageSnapshot,
  UsageState,
} from '@persona/shared';
import type { SessionManager } from '../../session/session-manager.js';
import {
  estimateAssemblyTokens,
  estimateMessagesTokens,
} from '../../agent/memory/token-estimate.js';
import { getAgentConfig } from '../../agent/agent-config-store.js';
import { assembleAgentParts } from '../../agent/run-config-factory.js';
import { resolveWorkspaceDir } from '../../agent/workspace.js';
import { models } from '../../agent/pi-models.js';
import { broadcastToSession } from '../websocket-server.js';
import { Logger } from '../../util/logger.js';

/**
 * 对模型报回的 usage 做对账。
 *
 * total 与 input 加 output 加 cacheRead 加 cacheWrite 之和不一致，
 * 或主字段出现负数与 NaN，或 total 非正，整笔报数作废并打 USAGE 日志。
 * cacheWrite1h 是 cacheWrite 的子集，扩展字段不参与核对。
 *
 * @param raw - pi-ai done 事件携带的 usage
 * @returns 对账通过返回底数口径的 base，作废返回 null
 */
export function validateUsage(raw: Usage): { base: number } | null {
  const parts = [raw.input, raw.output, raw.cacheRead, raw.cacheWrite];
  if (parts.some((n) => !Number.isFinite(n) || n < 0)) {
    Logger.log('USAGE', 'Report discarded, non-finite or negative field', {
      input: raw.input,
      output: raw.output,
      cacheRead: raw.cacheRead,
      cacheWrite: raw.cacheWrite,
    });
    return null;
  }
  if (raw.totalTokens <= 0) {
    Logger.log('USAGE', 'Report discarded, non-positive total', {
      totalTokens: raw.totalTokens,
    });
    return null;
  }
  const sum = parts.reduce((acc, n) => acc + n, 0);
  if (raw.totalTokens !== sum) {
    Logger.log('USAGE', 'Report discarded, total mismatch', {
      totalTokens: raw.totalTokens,
      sum,
    });
    return null;
  }
  // 底数口径：input 加缓存读加缓存写，缺项按零
  return { base: raw.input + raw.cacheRead + raw.cacheWrite };
}

/**
 * 从落账 shares 推导装配估算量，即两段装配合计。
 *
 * null 表示旧数据不带分段，返回 undefined 让分子走旧公式。
 */
function deriveAssemblyTokens(
  shares: BreakdownShares | null
): number | undefined {
  return shares ? shares.systemPersona + shares.toolsSkills : undefined;
}

/**
 * 报数落账，写 usage_state 并返回快照供推送。
 *
 * 落新底数时 netAdjust 清零并用本次 shares 覆盖旧值，新 base 已反映
 * 压缩后的真实体量，旧净调整不清零会再扣一遍导致占用持续偏低。
 * anchorSeq 是会话坐标的消息数，由 chat-service 在回调里换算后传入。
 * assemblyTokens 随底数一并记录，供其后的分子装配修正。
 *
 * @returns 拼装好的占用快照，会话不存在返回 null
 */
export function recordReport(opts: {
  sessionId: string;
  sessionManager: SessionManager;
  base: number;
  anchorSeq: number;
  shares: BreakdownShares | null;
  contextWindow: number;
}): UsageSnapshot | null {
  const { sessionId, sessionManager, base, anchorSeq, shares, contextWindow } =
    opts;
  const session = sessionManager.getSession(sessionId);
  if (!session) return null;

  const state: UsageState = {
    base,
    anchorSeq,
    netAdjust: 0,
    shares,
    assemblyTokens: deriveAssemblyTokens(shares),
  };
  sessionManager.updateUsageState(sessionId, state);
  Logger.log('USAGE', 'Report recorded', { sessionId, base, anchorSeq });
  return buildSnapshot({ ...session, usageState: state }, contextWindow);
}

/**
 * 压缩净调整落账。
 *
 * 压缩落地时叠加摘要信封与批次的估算差值，下一次真实报数落账时清零。
 */
export function updateNetAdjust(
  sessionId: string,
  sessionManager: SessionManager,
  delta: number
): void {
  const session = sessionManager.getSession(sessionId);
  if (!session) return;
  const state: UsageState = session.usageState ?? {
    base: null,
    anchorSeq: 0,
    netAdjust: 0,
    shares: null,
  };
  sessionManager.updateUsageState(sessionId, {
    ...state,
    netAdjust: state.netAdjust + delta,
  });
  Logger.log('USAGE', 'Net adjust updated', { sessionId, delta });
}

/**
 * 分子算法，base 加锚点后持久消息估算加压缩净调整。
 *
 * 底数带 assemblyTokens 时先减报数时装配再加现行装配，装配随配置即时换算。
 * currentAssemblyTokens 缺省按报数时装配取值，修正归零等价旧公式。
 * 估算误差可能把结果推成负数，返回前钳制到零。
 *
 * @returns 分子数值，base 缺失返回 null
 */
export function computeNumerator(
  session: Session,
  currentAssemblyTokens?: number
): number | null {
  const state = session.usageState;
  if (!state || state.base === null) return null;
  const increment = estimateMessagesTokens(
    session.messages.slice(state.anchorSeq)
  );
  const correction =
    state.assemblyTokens !== undefined && currentAssemblyTokens !== undefined
      ? currentAssemblyTokens - state.assemblyTokens
      : 0;
  return Math.max(0, state.base + correction + increment + state.netAdjust);
}

/**
 * 估算轨分子，currentNumerator 的无底数分支取数。
 *
 * 现行装配估算加全部持久消息估算，净调整不参与，压缩改写已体现在消息列表本身。
 */
function estimateNumerator(assemblyTokens: number, session: Session): number {
  return assemblyTokens + estimateMessagesTokens(session.messages);
}

/**
 * 两轨选择，有底数走真实轨带装配修正，无底数走估算轨。
 *
 * sessionContextSnapshot 与 chat-service 的触发判据共用，判据与显示同源的
 * 物理保证，选择逻辑全仓只此一处。
 */
export function currentNumerator(
  session: Session,
  currentAssemblyTokens: number
): number {
  if (session.usageState?.base != null) {
    return computeNumerator(session, currentAssemblyTokens)!;
  }
  return estimateNumerator(currentAssemblyTokens, session);
}

/**
 * 拼占用快照，分子走 computeNumerator，base 缺失返回 null。
 */
export function buildSnapshot(
  session: Session,
  contextWindow: number
): UsageSnapshot | null {
  const used = computeNumerator(session);
  if (used === null) return null;
  return {
    used,
    window: contextWindow,
    shares: session.usageState?.shares ?? null,
  };
}

/**
 * 按当前配置现算会话的装配估算与模型窗口。
 *
 * segments 与 tools 经 assembleAgentParts 组装，messages 段取会话持久消息估算，
 * 窗口从会话固化模型或 Agent 默认模型解析。模型查不到注册表返回 null，
 * 那是图标壳场景的判定依据。
 */
function currentAssemblyEstimate(
  session: Session,
  agentConfig: AgentConfig,
  sessionManager: SessionManager
): {
  shares: BreakdownShares;
  assemblyTokens: number;
  contextWindow: number;
} | null {
  const workspaceDir = resolveWorkspaceDir(session, agentConfig).dir;
  const parts = assembleAgentParts(
    agentConfig,
    session,
    workspaceDir,
    sessionManager
  );
  const model = models.getModel(parts.provider, parts.modelId);
  if (!model) return null;
  const assembly = estimateAssemblyTokens(parts.segments, parts.tools);
  return {
    shares: {
      messages: estimateMessagesTokens(session.messages),
      systemPersona: assembly.systemPersona,
      toolsSkills: assembly.toolsSkills,
    },
    assemblyTokens: assembly.systemPersona + assembly.toolsSkills,
    contextWindow: model.contextWindow,
  };
}

/** 每会话最后推送快照的内存表，报数、压缩、刷新与补位共用 */
const lastPushed = new Map<string, UsageSnapshot>();

/**
 * 判断两份快照是否完全一致，used 与 window 与三段数字逐一相等。
 */
function snapshotEquals(a: UsageSnapshot, b: UsageSnapshot): boolean {
  if (a.used !== b.used || a.window !== b.window) return false;
  if (a.shares === null || b.shares === null) {
    return a.shares === b.shares;
  }
  return (
    a.shares.messages === b.shares.messages &&
    a.shares.systemPersona === b.shares.systemPersona &&
    a.shares.toolsSkills === b.shares.toolsSkills
  );
}

/**
 * 占用快照统一推送出口，对比该会话最后推送的快照，数字与分段都没变不广播。
 *
 * 订阅补推不走此出口也不动内存表，重连场景由 per-client 补推自愈兜底。
 *
 * @returns 是否实际广播，供调用方决定补日志
 */
export function pushUsageSnapshot(
  sessionId: string,
  snapshot: UsageSnapshot,
  source: 'model' | 'compression' | 'estimate'
): boolean {
  const previous = lastPushed.get(sessionId);
  if (previous && snapshotEquals(previous, snapshot)) return false;
  lastPushed.set(sessionId, snapshot);
  broadcastToSession(sessionId, {
    type: 'context_usage',
    sessionId,
    used: snapshot.used,
    window: snapshot.window,
    shares: snapshot.shares,
    source,
  });
  return true;
}

/**
 * 清该会话的去重内存表，session_deleted 时调用防泄漏。
 */
export function forgetUsageSnapshot(sessionId: string): void {
  lastPushed.delete(sessionId);
}

/**
 * 配置变化触发的占用刷新，现算快照经统一出口推出。
 *
 * 刷新全程不写库，写库会再发 session_updated 形成回环，不写库天然无环。
 * 只在实际推送时打 USAGE 日志，reason 记录触发来源。
 */
export function refreshUsageSnapshot(
  sessionId: string,
  sessionManager: SessionManager,
  reason: string
): void {
  const snapshot = sessionContextSnapshot(sessionManager, sessionId);
  if (snapshot && pushUsageSnapshot(sessionId, snapshot, 'estimate')) {
    Logger.log('USAGE', 'Snapshot refreshed', {
      sessionId,
      reason,
      used: snapshot.used,
      window: snapshot.window,
    });
  }
}

/**
 * 报数缺席时的估算补位，三段合计落底数，锚点取当前持久消息条数。
 *
 * 净调整清零，窗口现状的估算已含压缩差值，保留会重复扣。
 * assemblyTokens 随底数一并记录，补位底数此后同样吃装配修正。
 *
 * @returns 拼装好的占用快照，会话不存在返回 null
 */
export function recordEstimatedBase(opts: {
  sessionId: string;
  sessionManager: SessionManager;
  shares: BreakdownShares;
  contextWindow: number;
}): UsageSnapshot | null {
  const { sessionId, sessionManager, shares, contextWindow } = opts;
  const session = sessionManager.getSession(sessionId);
  if (!session) return null;
  const state: UsageState = {
    base: shares.messages + shares.systemPersona + shares.toolsSkills,
    anchorSeq: sessionManager.getMessageCount(sessionId),
    netAdjust: 0,
    shares,
    assemblyTokens: deriveAssemblyTokens(shares),
  };
  sessionManager.updateUsageState(sessionId, state);
  Logger.log('USAGE', 'Estimated base recorded', {
    sessionId,
    base: state.base,
    anchorSeq: state.anchorSeq,
  });
  return buildSnapshot({ ...session, usageState: state }, contextWindow);
}

/**
 * 按会话现算占用快照，供订阅补态与压缩取数等无装配上下文的场景。
 *
 * 分子经 currentNumerator 两轨选择，有底数带装配修正，无底数走估算轨。
 * 分母从会话固化模型或 Agent 默认模型解析，模型不在注册表时返回 null。
 */
export function sessionContextSnapshot(
  sessionManager: SessionManager,
  sessionId: string
): UsageSnapshot | null {
  const session = sessionManager.getSession(sessionId);
  if (!session) return null;
  const agentConfig = getAgentConfig(session.agentId);
  if (!agentConfig) return null;
  const estimate = currentAssemblyEstimate(
    session,
    agentConfig,
    sessionManager
  );
  if (!estimate) return null;
  return {
    used: currentNumerator(session, estimate.assemblyTokens),
    window: estimate.contextWindow,
    shares: estimate.shares,
  };
}
