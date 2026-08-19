/**
 * @fileoverview 上下文压缩服务：聊天 Session 的异步摘要压缩。
 */

import { Logger } from '../../util/logger.js';
import { errorMessage } from '../../util/errors.js';
import { streamSingleTurn } from '../../agent/llm-single-call.js';
import { MemoryStore } from '../../agent/memory/memory-store.js';
import {
  estimateMessagesTokens,
  estimateMessageTokens,
  messageToText,
} from '../../agent/memory/token-estimate.js';
import COMPRESS_PROMPT from '../../agent/prompt/compress.txt';
import type { SessionManager } from '../../session/index.js';
import type { Message } from '../../schema/index.js';

/** [RAW] 兜底标签：标记该条 history 是 LLM 失败时的原文截断，非正常摘要 */
const RAW_TAG = '[RAW]';
/** [RAW] 兜底保留的最大字符数 */
const RAW_MAX_CHARS = 2000;

/** runCompression 的入参 */
interface CompressionOptions {
  agentId: string;
  sessionId: string;
  sessionManager: SessionManager;
  /** 压缩触发阈值：未摘要 token 超过 contextWindow 的该比例才触发 */
  threshold: number;
  /** 模型上下文窗口大小 */
  contextWindow: number;
  provider: string;
  modelId: string;
}

/** 防并发重入：正在压缩的 sessionId 集合 */
const inflight = new Set<string>();

/**
 * 触发一次压缩。
 *
 * LLM 失败时用 [RAW] 原文兜底并仍推进指针，原文从不删除，数据绝不丢失。
 */
export async function runCompression(opts: CompressionOptions): Promise<void> {
  const { agentId, sessionId, sessionManager, threshold, contextWindow } = opts;

  if (inflight.has(sessionId)) {
    Logger.log('COMPRESS', 'Already in progress, skip', { sessionId });
    return;
  }
  inflight.add(sessionId);

  try {
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      Logger.log('COMPRESS', 'Session not found', { sessionId });
      return;
    }

    const fromIndex = session.summarizedUpTo ?? 0;
    const unsummarized = session.messages.slice(fromIndex);
    if (unsummarized.length < 2) return; // 不足一轮对话，无需压缩

    const triggerTokens = Math.floor((threshold / 100) * contextWindow);
    const unsummarizedTokens = estimateMessagesTokens(unsummarized);
    if (unsummarizedTokens <= triggerTokens) return; // 未超阈值，不压缩

    // 选压缩批次：一次压缩到阈值以下
    const batchEnd = selectCompressionBatch(
      unsummarized,
      unsummarizedTokens,
      triggerTokens
    );
    if (batchEnd === 0) return;

    const batch = unsummarized.slice(0, batchEnd);
    const newCursor = fromIndex + batchEnd;
    const transcript = batch.map(messageToText).join('\n');

    let content: string;
    try {
      const summary = await streamSingleTurn(
        transcript,
        COMPRESS_PROMPT,
        opts.provider,
        opts.modelId
      );
      content = summary.trim() || buildRawFallback(transcript);
    } catch (err) {
      Logger.log('COMPRESS', 'LLM failed, using [RAW] fallback', {
        sessionId,
        error: errorMessage(err),
      });
      content = buildRawFallback(transcript);
    }

    const memoryStore = new MemoryStore(agentId);
    memoryStore.appendHistory({
      cursor: newCursor,
      timestamp: Date.now(),
      content,
    });
    sessionManager.updateSummarizedUpTo(sessionId, newCursor);

    Logger.log('COMPRESS', 'Compressed', {
      sessionId,
      batchSize: batch.length,
      newCursor,
      contentLength: content.length,
      fallback: content.startsWith(RAW_TAG),
    });
  } catch (err) {
    Logger.log('COMPRESS', 'Unexpected error', {
      sessionId,
      error: errorMessage(err),
    });
  } finally {
    inflight.delete(sessionId);
  }
}

/**
 * 选定压缩批次的结束下标。
 *
 * 压缩掉最老的若干完整对话轮，使剩余未摘要消息的估算 token 降到阈值以下。
 * "完整轮"以 assistant 消息为边界——批次必须结束在 assistant 消息上，避免把半截对话拆开。
 *
 * @param unsummarized - 未摘要的原始消息
 * @param unsummarizedTokens - 未摘要消息的估算 token 总数
 * @param triggerTokens - 触发阈值对应的 token 数
 * @returns 批次结束下标；unsummarized[0:end] 为待压缩批次。0 表示无可压缩批次。
 */
function selectCompressionBatch(
  unsummarized: Message[],
  unsummarizedTokens: number,
  triggerTokens: number
): number {
  const excess = unsummarizedTokens - triggerTokens;
  let accumulated = 0;
  // 第一遍：找到第一个累计 token ≥ excess 的 assistant 边界
  for (let i = 0; i < unsummarized.length; i++) {
    accumulated += estimateMessageTokens(unsummarized[i]!);
    if (unsummarized[i]!.role === 'assistant' && accumulated >= excess) {
      return i + 1;
    }
  }
  // 退化：没有 assistant 边界满足条件时，压缩到最后一个 assistant 边界
  for (let i = unsummarized.length - 1; i >= 0; i--) {
    if (unsummarized[i]!.role === 'assistant') return i + 1;
  }
  return 0;
}

/** [RAW] 兜底：LLM 失败时把原文截断后包进 [RAW] 标签，保留信息不丢。 */
function buildRawFallback(transcript: string): string {
  const trimmed =
    transcript.length > RAW_MAX_CHARS
      ? transcript.slice(0, RAW_MAX_CHARS) + '...'
      : transcript;
  return `${RAW_TAG} ${trimmed}`;
}
