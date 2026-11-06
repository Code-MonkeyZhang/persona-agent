/**
 * @fileoverview 运行时上下文注入：每次请求前组装时间、环境变化与相关记忆。
 *
 * 设计文档：docs/设计文档/AgentCore/设计/System Prompt/运行时上下文注入.md
 * 产出按寿命分流：时间与环境变化落盘、以 context 角色进会话库，前端不渲染；
 * 相关记忆节临时拼出随请求走，用完即弃不进聊天记录。
 */

import { getMcpPromptInfo } from '../../mcp/index.js';
import type { Session } from '../../session/types.js';
import { Logger } from '../../util/logger.js';
import {
  MemoryStore,
  formatEntryLine,
} from '../../agent/memory/memory-store.js';
import {
  buildScanText,
  matchTriggered,
} from '../../agent/memory/entry-matcher.js';

/** 时间行刷新阈值：距上次注入不足该值时跳过时间行 */
const REFRESH_MS = 10 * 60 * 1000;

/** 相关记忆节节头，加重措辞强调这是亲手记录的既成事实 */
const MEMORY_HEADER =
  '[system] 长期记忆，均为你此前亲手记录的既成事实，回答相关问题时优先以此为据:';

/** 环境变化节节头，现状无节头，接入记忆节时顺手补齐 */
const ENV_HEADER = '[system] Environment changes:';

/** buildRuntimeContext 的返回形态：persisted 落盘，ephemeral 随请求走用完即弃 */
export interface RuntimeContextParts {
  persisted: string;
  ephemeral: string;
}

/** 一个回合的环境快照，用于回合间对比出变化行 */
interface EnvSnapshot {
  mcp: Record<string, string>;
  workspacePath: string;
  model: string;
  skills: string[];
}

/** 各会话上一回合的环境快照；进程重启后为空，代价只是重新记基线 */
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
 * 目录用调用方已解析的 workspaceDir，不读 session.workspacePath；
 * 技能清单存排序副本，让 diff 不受分配顺序影响。
 */
function takeSnapshot(
  session: Session,
  workspaceDir: string,
  mcpNames?: string[],
  skillNames?: string[]
): EnvSnapshot {
  const mcp: Record<string, string> = {};
  if (mcpNames?.length) {
    for (const { name, status } of getMcpPromptInfo(mcpNames)) {
      mcp[name] = status;
    }
  }
  // 会话模型在发送链路开头已固化,空值回落仅作类型完备,快照不会见到空值
  const modelLabel = session.model
    ? `${session.model.provider}/${session.model.model}`
    : 'unresolved';
  return {
    mcp,
    workspacePath: workspaceDir,
    model: modelLabel,
    skills: [...(skillNames ?? [])].sort(),
  };
}

/** 对比两份回合快照，产出变化通知行 */
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
  const addedSkills = curr.skills.filter((name) => !prev.skills.includes(name));
  const removedSkills = prev.skills.filter(
    (name) => !curr.skills.includes(name)
  );
  if (addedSkills.length > 0) {
    lines.push(`- 技能清单已更新：新增 ${addedSkills.join('、')}`);
  }
  if (removedSkills.length > 0) {
    lines.push(`- 技能清单已更新：移除 ${removedSkills.join('、')}`);
  }
  return lines;
}

/**
 * 组装本次请求的运行时上下文，按寿命分流为落盘与临时两部分。
 *
 * 先取旧快照、立刻写入新快照——首回合旧快照不存在，只记基线，变化行为空。
 * 生产的节分两种寿命：时间节与环境变化节落盘走 context 角色，相关记忆节
 * 每轮独立判定不参与十分钟节流，临时拼出由调用方带进模型请求尾部，
 * 用完即弃不进聊天记录。任一节非空即发，时间节被节流但记忆节命中时
 * 只发 ephemeral 部分。指令行只随时间节出现。
 *
 * @param sessionId - Session 唯一标识符，快照表的 key
 * @param session - 当前 Session，提供模型配置与派生时间戳，触发记忆经其 agentId 取存储
 * @param workspaceDir - 调用方已解析的工作目录
 * @param mcpNames - Agent 配置的 MCP 服务名列表
 * @param skillNames - Agent 配置的技能名列表，变化时产出通知行
 * @param now - 当前时间，测试可注入
 * @returns persisted 与 ephemeral 两段文本，空串表示对应寿命无内容
 */
export function buildRuntimeContext(
  sessionId: string,
  session: Session,
  workspaceDir: string,
  mcpNames?: string[],
  skillNames?: string[],
  now: Date = new Date()
): RuntimeContextParts {
  const prev = snapshots.get(sessionId);
  const curr = takeSnapshot(session, workspaceDir, mcpNames, skillNames);
  snapshots.set(sessionId, curr);
  const changes = prev ? diffLines(prev, curr) : [];

  const prevContextAt = session.lastContextAt;
  const stale =
    prevContextAt === undefined || now.getTime() - prevContextAt >= REFRESH_MS;

  // 相关记忆节：扫描最近两条消息命中触发条目，每轮独立判定
  const triggered = new MemoryStore(session.agentId).listTriggeredEnabled();
  const hits = matchTriggered(triggered, buildScanText(session.messages));
  if (hits.length > 0) {
    Logger.log('CTX', 'Memory section', {
      sessionId,
      hitUids: hits.map((entry) => entry.uid),
      total: triggered.length,
    });
  }
  const ephemeral =
    hits.length > 0
      ? [MEMORY_HEADER, ...hits.map(formatEntryLine)].join('\n')
      : '';

  if (!stale && changes.length === 0 && hits.length === 0) {
    Logger.log('CTX', 'Skipped', { sessionId, reason: 'within-threshold' });
    return { persisted: '', ephemeral: '' };
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
    sections.push(`${ENV_HEADER}\n${changes.join('\n')}`);
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
    memoryHits: hits.length,
  });
  return { persisted: sections.join('\n\n'), ephemeral };
}
