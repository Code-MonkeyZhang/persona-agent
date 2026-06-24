/**
 * @fileoverview 记忆沉淀服务：定期把 history 摘要整理进 MEMORY.md。
 */

import { Logger } from '../../util/logger.js';
import { errorMessage } from '../../util/errors.js';
import { streamSingleTurn } from '../../agent/llm-single-call.js';
import { MemoryStore } from '../../agent/memory/memory-store.js';
import CONSOLIDATE_PROMPT from '../../agent/prompt/consolidate.txt';
import type { AgentConfig } from '../../agent/types.js';

/** 每批整理的最大 history 条目数 */
const DREAM_BATCH_SIZE = 20;
/** compress 阶段打的属性标签；整理后从记忆正文剥离 */
const MEMORY_TAGS = /\[(permanent|durable|ephemeral|correction|skip|RAW)\]\s?/g;

/** 防并发重入：正在整理的 agentId 集合 */
const inflight = new Set<string>();

/**
 * 整理一批 history 摘要进 MEMORY.md。
 *
 * 读取 `dream_cursor` 之后最多 {@link DREAM_BATCH_SIZE} 条未处理摘要 + 当前
 * MEMORY.md，交给大模型归纳/合并/去重/修正，输出干净 markdown
 * 覆盖写回 MEMORY.md。**仅整轮成功才推进 dream_cursor**——失败不推进，下次
 * 原样重跑同一批，幂等不漏不重。模型用 Agent 的 defaultModel。
 *
 * @param agentConfig - Agent 配置
 */
export async function consolidateMemory(
  agentConfig: AgentConfig
): Promise<void> {
  if (inflight.has(agentConfig.id)) {
    Logger.log('DREAM', 'Already in progress, skip', {
      agentId: agentConfig.id,
    });
    return;
  }
  inflight.add(agentConfig.id);

  try {
    const memoryStore = new MemoryStore(agentConfig.id);
    const cursor = memoryStore.getDreamCursor();
    const batch = memoryStore.readHistory(cursor, DREAM_BATCH_SIZE);
    if (batch.length === 0) return; // 无未处理料，no-op

    const currentMemory = memoryStore.readMemoryMd();
    const userMessage =
      `<current_memory>\n${currentMemory || '(empty)'}\n</current_memory>\n\n` +
      `<new_summaries>\n${batch.map((e) => e.content).join('\n')}\n</new_summaries>`;

    const { provider, model: modelId } = agentConfig.defaultModel;
    const raw = await streamSingleTurn(
      userMessage,
      CONSOLIDATE_PROMPT,
      provider,
      modelId
    );
    // 防御性剥离 compress 阶段残留的属性标签
    const clean = raw.replace(MEMORY_TAGS, '').trim();
    if (!clean) {
      Logger.log('DREAM', 'Empty consolidation output, skip', {
        agentId: agentConfig.id,
      });
      return;
    }

    memoryStore.writeMemoryMd(clean);
    memoryStore.advanceDreamCursor(batch.length);

    Logger.log('DREAM', 'Consolidated', {
      agentId: agentConfig.id,
      batchSize: batch.length,
      newCursor: cursor + batch.length,
      memoryLength: clean.length,
    });
  } catch (err) {
    Logger.log('DREAM', 'Consolidation failed', {
      agentId: agentConfig.id,
      error: errorMessage(err),
    });
  } finally {
    inflight.delete(agentConfig.id);
  }
}
