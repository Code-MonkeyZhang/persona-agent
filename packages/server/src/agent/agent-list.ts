/**
 * @fileoverview Agent 列表的读取整形。
 *
 * 头像哈希不落盘，读取时按文件内容现算附加。
 * 列表路由与同步快照共用同一份组装逻辑。
 */

import type { AgentConfig, SnapshotAgent } from '@persona/shared';
import { listAgentConfigs } from './agent-config-store.js';
import { getAgentAvatarPath } from '../util/paths.js';
import { getFileHash } from '../util/asset-hash.js';

/**
 * 给 Agent 配置附加头像文件的内容哈希。
 * 头像文件不存在时哈希为空串，客户端据此走占位分支不发请求。
 */
export function withAvatarHash(agent: AgentConfig): SnapshotAgent {
  return { ...agent, avatarHash: getFileHash(getAgentAvatarPath(agent.id)) };
}

/** 列出全部 Agent 并附加头像哈希，列表路由与同步快照共用。 */
export function listAgentsWithHashes(): SnapshotAgent[] {
  return listAgentConfigs().map(withAvatarHash);
}
