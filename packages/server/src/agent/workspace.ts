/**
 * @fileoverview 工作目录运行时解析与失效写回。
 *
 * 解析顺序：会话临时路径 → Agent 默认路径 → 默认工作空间。
 * 每层校验可用性，失效层记入明细；调用方据此把生效路径写回配置，
 * 保证下次解析直接通过，避免每个回合重复回退。
 */

import * as fs from 'node:fs';
import { getWorkspaceDir } from '../util/paths.js';
import type { SessionManager } from '../session/index.js';
import type { Session } from '../session/types.js';
import { updateAgentConfig } from './agent-config-store.js';
import type { AgentConfig } from './types.js';

/** 路径是否为已存在且可写的目录 */
function isUsableDir(dirPath: string): boolean {
  try {
    if (!fs.statSync(dirPath).isDirectory()) return false;
    fs.accessSync(dirPath, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/** 失效的工作目录来源层 */
interface InvalidWorkspace {
  source: 'session' | 'agent';
  path: string;
}

/** 工作目录解析结果 */
interface ResolvedWorkspace {
  /** 实际生效的工作目录，保证已存在且可写 */
  dir: string;
  /** 解析途中失效的层，按尝试顺序排列 */
  invalid: InvalidWorkspace[];
}

/**
 * 解析会话的实际工作目录。
 *
 * - 依次尝试会话临时路径与 Agent 默认路径，校验存在且可写
 * - 失效层记入 invalid 并继续向下回退
 * - 全部失效时回落默认工作空间并确保目录存在
 *
 * @param session - 当前会话
 * @param agentConfig - 会话所属的 Agent 配置
 * @returns 解析结果，dir 保证可用
 */
export function resolveWorkspaceDir(
  session: Session,
  agentConfig: AgentConfig
): ResolvedWorkspace {
  const candidates: Array<{ source: 'session' | 'agent'; path: string }> = [
    { source: 'session', path: session.workspacePath },
    { source: 'agent', path: agentConfig.defaultWorkspacePath },
  ].filter((c): c is { source: 'session' | 'agent'; path: string } =>
    Boolean(c.path && c.path.trim().length > 0)
  );

  const invalid: InvalidWorkspace[] = [];
  for (const candidate of candidates) {
    if (isUsableDir(candidate.path.trim())) {
      return { dir: candidate.path.trim(), invalid };
    }
    invalid.push({ source: candidate.source, path: candidate.path.trim() });
  }

  const fallback = getWorkspaceDir();
  fs.mkdirSync(fallback, { recursive: true });
  return { dir: fallback, invalid };
}

/**
 * 把生效路径写回失效层对应的配置。
 *
 * - agent 层：更新 Agent 默认工作空间
 * - session 层：更新会话临时路径
 * - 写回值为本次解析的生效路径，下次解析必然通过
 *
 * @param resolved - 解析结果，invalid 非空时才会产生写回
 * @param agentId - 会话所属 Agent ID
 * @param sessionId - 当前会话 ID
 * @param sessionManager - 会话管理器
 */
export function persistResolvedWorkspace(
  resolved: ResolvedWorkspace,
  agentId: string,
  sessionId: string,
  sessionManager: SessionManager
): void {
  for (const { source } of resolved.invalid) {
    if (source === 'agent') {
      updateAgentConfig(agentId, {
        defaultWorkspacePath: resolved.dir,
      });
    } else {
      sessionManager.updateWorkspacePath(sessionId, resolved.dir);
    }
  }
}
