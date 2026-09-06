/**
 * @fileoverview 运行时上下文注入：每次请求前组装时间与环境变化文本。
 *
 * 设计文档：docs/设计文档/AgentCore/设计/System Prompt/运行时上下文注入.md
 * 输出以 context 角色落盘、以 user 消息进入模型上下文，前端不渲染。
 */

import { getMcpPromptInfo } from '../../mcp/index.js';
import type { Session } from '../../session/types.js';
import { Logger } from '../../util/logger.js';

/** 时间行刷新阈值：距上次注入不足该值时跳过时间行 */
const REFRESH_MS = 10 * 60 * 1000;

/** 一轮请求的环境快照，用于轮次间对比出变化行 */
interface EnvSnapshot {
  mcp: Record<string, string>;
  workspacePath: string;
  model: string;
}

/** 各会话上一轮的环境快照；进程重启后为空，代价只是重新记基线 */
const snapshots = new Map<string, EnvSnapshot>();

/**
 * 把非负时长格式化为中文单位。
 *
 * 移植自 DSH time-context 的 formatDuration，去掉秒级——
 * 刷新阈值 10 分钟下秒级是噪声。
 */
function formatDuration(elapsedMs: number): string {
  let minutes = Math.floor(Math.max(0, elapsedMs) / 60000);
  const days = Math.floor(minutes / 1440);
  minutes %= 1440;
  const hours = Math.floor(minutes / 60);
  minutes %= 60;
  if (days === 0 && hours === 0 && minutes === 0) return '不到1分钟';
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}天`);
  if (hours > 0) parts.push(`${hours}小时`);
  if (minutes > 0) parts.push(`${minutes}分`);
  return parts.join('');
}

/**
 * 格式化当前时间为 `YYYY-MM-DD 星期X HH:mm (UTC+X)`。
 *
 * 日期格式化沿用 run-config-factory 原生产写法，星期由 Intl 补充。
 */
function formatNow(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const tz = `UTC${sign}${Math.floor(absOffset / 60)}${absOffset % 60 > 0 ? `:${pad(absOffset % 60)}` : ''}`;
  const weekday = new Intl.DateTimeFormat('zh-CN', {
    weekday: 'long',
  }).format(now);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${weekday} ${pad(now.getHours())}:${pad(now.getMinutes())} (${tz})`;
}

/**
 * 采集当前环境快照。
 *
 * MCP 状态复用 getMcpPromptInfo，与 buildSystemPrompt 同源；
 * 目录用调用方已解析的 workspaceDir，不读 session.workspacePath。
 */
function takeSnapshot(
  session: Session,
  workspaceDir: string,
  mcpNames?: string[]
): EnvSnapshot {
  const mcp: Record<string, string> = {};
  if (mcpNames?.length) {
    for (const { name, status } of getMcpPromptInfo(mcpNames)) {
      mcp[name] = status;
    }
  }
  return {
    mcp,
    workspacePath: workspaceDir,
    model: `${session.model.provider}/${session.model.model}`,
  };
}

/** 对比两轮快照，产出变化通知行 */
function diffLines(prev: EnvSnapshot, curr: EnvSnapshot): string[] {
  const lines: string[] = [];
  for (const name of new Set([
    ...Object.keys(prev.mcp),
    ...Object.keys(curr.mcp),
  ])) {
    const before = prev.mcp[name] ?? 'unknown';
    const after = curr.mcp[name] ?? 'unknown';
    if (before !== after) {
      lines.push(`- MCP 服务「${name}」状态变化：${before} → ${after}`);
    }
  }
  if (prev.workspacePath !== curr.workspacePath) {
    lines.push(
      `- 工作目录已从 ${prev.workspacePath} 切换为 ${curr.workspacePath}`
    );
  }
  if (prev.model !== curr.model) {
    lines.push(`- 模型已从 ${prev.model} 切换为 ${curr.model}`);
  }
  return lines;
}

/**
 * 组装本次请求的运行时上下文文本。
 *
 * 先取旧快照、立刻写入新快照——首轮旧快照不存在，只记基线，变化行为空。
 * 时间节仅在距上次注入超过阈值或从未注入时出现；
 * 指令行只随时间节出现；两者皆空时返回空串，调用方整条跳过。
 *
 * @param sessionId - Session 唯一标识符，快照表的 key
 * @param session - 当前 Session，提供模型配置与派生时间戳
 * @param workspaceDir - 调用方已解析的工作目录
 * @param mcpNames - Agent 配置的 MCP 服务名列表
 * @param now - 当前时间，测试可注入
 * @returns 注入文本；空串表示本次无需注入
 */
export function buildRuntimeContext(
  sessionId: string,
  session: Session,
  workspaceDir: string,
  mcpNames?: string[],
  now: Date = new Date()
): string {
  const prev = snapshots.get(sessionId);
  const curr = takeSnapshot(session, workspaceDir, mcpNames);
  snapshots.set(sessionId, curr);
  const changes = prev ? diffLines(prev, curr) : [];

  const prevContextAt = session.lastContextAt;
  const stale =
    prevContextAt === undefined || now.getTime() - prevContextAt >= REFRESH_MS;

  if (!stale && changes.length === 0) {
    Logger.log('CTX', 'Skipped', { sessionId, reason: 'within-threshold' });
    return '';
  }

  const sections: string[] = [];
  if (stale) {
    let timeLine = `[system] 当前时间：${formatNow(now)}`;
    if (session.lastMessageAt !== undefined) {
      timeLine += `\n距上一条消息已过去：${formatDuration(now.getTime() - session.lastMessageAt)}`;
    }
    sections.push(timeLine);
  }
  if (changes.length > 0) {
    sections.push(changes.join('\n'));
  }
  if (stale) {
    sections.push(
      '涉及"今天/明天/星期几"等时间表述时，以本消息的时间为准，不要从对话历史推断。'
    );
  }

  Logger.log('CTX', 'Injected', {
    sessionId,
    hasTimeLine: stale,
    changeCount: changes.length,
  });
  return sections.join('\n\n');
}
