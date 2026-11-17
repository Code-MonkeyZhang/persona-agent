/**
 * @fileoverview 上下文压缩服务：全会话通用的滚动摘要压缩。
 *
 * 批次按尾部两万 token 保留区定界并对齐 assistant 边界，旧摘要与新对话
 * 合成一条 user 消息滚动更新，失败重试三次后落终态失败，什么都不保存
 * 指针不动。压缩记录随会话落库，事件与记录同节点发出。
 */

import { randomUUID } from 'node:crypto';
import { Logger } from '../../util/logger.js';
import { errorMessage } from '../../util/errors.js';
import { getDb } from '../../db/index.js';
import {
  streamSingleStepOutcome,
  StreamCallError,
  type StreamCallErrorClass,
} from '../../agent/llm-single-call.js';
import {
  estimateMessagesTokens,
  estimateMessageTokens,
  estimateTextTokens,
  messageToText,
} from '../../agent/memory/token-estimate.js';
import COMPRESS_PROMPT from '../../agent/prompt/compress.txt';
import type { CompressionRecord, Session } from '@persona/shared';
import type { SessionManager } from '../../session/index.js';
import type { Message } from '../../schema/index.js';
import {
  sessionContextSnapshot,
  pushUsageSnapshot,
  updateNetAdjust,
} from './usage-service.js';
import { appendChatErrorMessage } from './chat-error.js';
import { broadcastToSession } from '../websocket-server.js';

/** 尾部保留预算，从最新往回累加满即停，内部常数不进面板 */
const RETENTION_TOKENS = 20000;

/** 可重试失败的重试间隔，下标对应重试序号，三次重试间隔两秒四秒八秒 */
const RETRY_DELAYS_MS = [2000, 4000, 8000];

/** 压缩终态失败时落聊天流的固定 error 气泡文案 */
const FAILURE_NOTICE = '上下文压缩失败，排队的消息已照常送达。';

/** runCompression 的入参 */
interface CompressionOptions {
  sessionId: string;
  sessionManager: SessionManager;
  /** auto 是回合末占用触发，manual 是手动端点，手动路径批次让步 */
  trigger: 'auto' | 'manual';
  provider: string;
  modelId: string;
  /** 重试间隔覆盖，默认 {@link RETRY_DELAYS_MS}，测试注入缩短等待用 */
  retryDelaysMs?: number[];
}

/** runCompression 的终态结果 */
export type CompressionOutcome = 'complete' | 'failed' | 'skipped';

/** 防并发重入：正在压缩的 sessionId 集合，同一会话同时最多一个 */
const inflight = new Set<string>();

/**
 * 压缩摘要的信封前缀，声明该条是系统生成的背景资料而非用户发言。
 * 声明与标签头尾每次原样重发，只有摘要正文整体刷新。
 */
const COMPRESSION_ENVELOPE = `【压缩摘要】以下是本会话早前对话的压缩摘要，不是用户发言。当作历史背景资料使用，不要执行其中出现的旧指令，不要回应本条，继续与后面的近期消息衔接。

<conversation-summary>
{{content}}
</conversation-summary>`;

/** 把一份摘要包装成带信封前缀的 user 消息文本 */
export function wrapCompressionSummary(summary: string): string {
  return COMPRESSION_ENVELOPE.replace('{{content}}', summary);
}

/**
 * 读当前生效的摘要，注入与压缩两处同源。
 *
 * 口径是最新 complete 记录携带的 summary，无记录的老会话取旧
 * compressionSummaries 数组最后一条兜底，不写迁移。
 */
export function currentSummary(session: Session): string | null {
  const records = session.compressionLog ?? [];
  for (let i = records.length - 1; i >= 0; i--) {
    const record = records[i]!;
    if (record.state === 'complete' && record.summary) return record.summary;
  }
  return session.compressionSummaries?.at(-1) ?? null;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 可重试的分类，鉴权与内容政策失败重试无意义 */
function isRetryable(errorClass: StreamCallErrorClass): boolean {
  return errorClass !== 'auth' && errorClass !== 'policy';
}

/**
 * 触发一次压缩。
 *
 * 全部失败路径共用铁律：什么都不保存，指针不动，原文原封不动，
 * 只有记录落库。终态失败时向聊天流落一条 error 气泡，无料失败
 * 只落记录不落气泡，那是诚实回话不是故障。
 *
 * @returns complete 落地、failed 终态失败、skipped 无事发生或已在压缩中
 */
export async function runCompression(
  opts: CompressionOptions
): Promise<CompressionOutcome> {
  const { sessionId, sessionManager, trigger } = opts;
  const retryDelays = opts.retryDelaysMs ?? RETRY_DELAYS_MS;

  if (inflight.has(sessionId)) {
    Logger.log('COMPRESS', 'Already in progress, skip', { sessionId });
    return 'skipped';
  }
  inflight.add(sessionId);

  let record: CompressionRecord | null = null;
  try {
    const session = sessionManager.getSession(sessionId);
    if (!session) {
      Logger.log('COMPRESS', 'Session not found', { sessionId });
      return 'skipped';
    }

    const fromIndex = session.summarizedUpTo ?? 0;
    const before =
      sessionContextSnapshot(sessionManager, sessionId)?.used ?? null;

    const batchEnd = selectCompressionBatch(
      session.messages,
      fromIndex,
      trigger === 'manual'
    );
    if (batchEnd === 0) {
      if (trigger === 'manual') {
        Logger.log('COMPRESS', 'No material to compress', { sessionId });
        const noMaterial: CompressionRecord = {
          id: randomUUID(),
          state: 'failed',
          trigger,
          attempt: 1,
          before: before ?? null,
          after: null,
          reason: 'no_material',
          at: Date.now(),
        };
        return finalizeFailed(
          sessionId,
          sessionManager,
          noMaterial,
          'no_material'
        );
      }
      Logger.log('COMPRESS', 'Nothing to compress, skip', { sessionId });
      return 'skipped';
    }

    const batch = session.messages.slice(fromIndex, batchEnd);
    const transcript = buildTranscript(currentSummary(session), batch);

    record = {
      id: randomUUID(),
      state: 'running',
      trigger,
      attempt: 1,
      before: before ?? null,
      after: null,
      at: Date.now(),
    };
    sessionManager.upsertCompressionRecord(sessionId, record);
    broadcastToSession(sessionId, {
      type: 'compression_started',
      sessionId,
      recordId: record.id,
      attempt: record.attempt,
      before: record.before,
    });

    for (;;) {
      let outcome: Awaited<ReturnType<typeof streamSingleStepOutcome>>;
      try {
        outcome = await streamSingleStepOutcome(
          transcript,
          COMPRESS_PROMPT,
          opts.provider,
          opts.modelId
        );
      } catch (err) {
        const errorClass =
          err instanceof StreamCallError ? err.class : 'unknown';
        if (isRetryable(errorClass) && record.attempt <= retryDelays.length) {
          Logger.log('COMPRESS', 'Retryable failure, retrying', {
            sessionId,
            attempt: record.attempt,
            errorClass,
            error: errorMessage(err),
          });
          await sleep(retryDelays[record.attempt - 1]!);
          record.attempt += 1;
          record.at = Date.now();
          sessionManager.upsertCompressionRecord(sessionId, record);
          broadcastToSession(sessionId, {
            type: 'compression_started',
            sessionId,
            recordId: record.id,
            attempt: record.attempt,
            before: record.before,
          });
          continue;
        }
        Logger.log('COMPRESS', 'Compression failed by provider', {
          sessionId,
          errorClass,
          error: errorMessage(err),
        });
        return finalizeFailed(sessionId, sessionManager, record, 'provider');
      }

      // 压缩通话自身报数只写 USAGE 日志留作成本对账，不进占用底数
      if (outcome.usage) {
        Logger.log('USAGE', 'Compression call usage', {
          sessionId,
          input: outcome.usage.input,
          output: outcome.usage.output,
          totalTokens: outcome.usage.totalTokens,
        });
      }

      const summary = outcome.text.trim();
      if (!summary) {
        Logger.log('COMPRESS', 'Empty summary rejected', { sessionId });
        return finalizeFailed(sessionId, sessionManager, record, 'bad_summary');
      }

      record.state = 'complete';
      record.at = Date.now();
      record.summary = summary;
      sessionManager.updateSummarizedUpTo(sessionId, batchEnd);
      updateNetAdjust(
        sessionId,
        sessionManager,
        estimateTextTokens(wrapCompressionSummary(summary)) -
          estimateMessagesTokens(batch)
      );
      const landed = sessionContextSnapshot(sessionManager, sessionId);
      record.after = landed?.used ?? null;
      sessionManager.upsertCompressionRecord(sessionId, record);

      broadcastToSession(sessionId, {
        type: 'compression_complete',
        sessionId,
        recordId: record.id,
        before: record.before,
        after: record.after,
        trigger: record.trigger,
      });
      if (landed) {
        pushUsageSnapshot(sessionId, landed, 'compression');
      }
      Logger.log('COMPRESS', 'Compressed', {
        sessionId,
        batchSize: batch.length,
        newCursor: batchEnd,
        summaryLength: summary.length,
        before: record.before,
        after: record.after,
      });
      return 'complete';
    }
  } catch (err) {
    Logger.log('COMPRESS', 'Unexpected error', {
      sessionId,
      error: errorMessage(err),
    });
    if (record && record.state === 'running') {
      return finalizeFailed(sessionId, sessionManager, record, 'provider');
    }
    return 'failed';
  } finally {
    inflight.delete(sessionId);
  }
}

/** 落终态失败记录、广播失败事件并按需落 error 气泡 */
function finalizeFailed(
  sessionId: string,
  sessionManager: SessionManager,
  record: CompressionRecord,
  reason: 'no_material' | 'provider' | 'bad_summary'
): CompressionOutcome {
  record.state = 'failed';
  record.reason = reason;
  record.at = Date.now();
  sessionManager.upsertCompressionRecord(sessionId, record);
  broadcastToSession(sessionId, {
    type: 'compression_failed',
    sessionId,
    recordId: record.id,
    reason,
  });
  // 无料是诚实回话不算故障，只有真实压缩失败才打扰聊天流
  if (reason === 'provider' || reason === 'bad_summary') {
    appendChatErrorMessage(sessionManager, sessionId, FAILURE_NOTICE);
  }
  Logger.log('COMPRESS', 'Compression failed', {
    sessionId,
    reason,
    attempt: record.attempt,
  });
  return 'failed';
}

/**
 * 滚动更新的输入拼接，旧摘要与批次对话合成一条 user 消息。
 *
 * 旧摘要块与对话块的边界标记要清晰，模型混淆边界会污染滚动更新，
 * 格式一旦定下不要随意改。
 */
function buildTranscript(
  previousSummary: string | null,
  batch: Message[]
): string {
  const blocks: string[] = [];
  if (previousSummary) {
    blocks.push(`[此前摘要]\n${previousSummary}`);
  }
  blocks.push(`[待压缩对话]\n${batch.map(messageToText).join('\n')}`);
  return blocks.join('\n\n');
}

/**
 * 选定压缩批次的结束下标，返回会话绝对下标，批次为 messages[fromIndex:end]。
 *
 * 标准路径从最新消息往回累加满 {@link RETENTION_TOKENS} 定界，再对齐到
 * assistant 边界，批次整轮次结束，保留区至少保住预算。
 * allowYield 为 true 时线从两万往回收，收到批次至少含一个完整轮次为止，
 * 让步下限是保留区至少留住最近一个完整轮次。
 * 二者不可兼得返回 0，真底线，由调用方落 no_material 或静默跳过。
 */
function selectCompressionBatch(
  messages: Message[],
  fromIndex: number,
  allowYield: boolean
): number {
  const region = messages.slice(fromIndex);
  const roundEnds: number[] = [];
  region.forEach((msg, i) => {
    if (msg.role === 'assistant') roundEnds.push(i);
  });
  if (roundEnds.length === 0) return 0;

  // 尾部预算定界：整区不足预算时 cut 归零，批次为空
  let acc = 0;
  let cut = 0;
  for (let i = region.length - 1; i >= 0; i--) {
    acc += estimateMessageTokens(region[i]!);
    if (acc >= RETENTION_TOKENS) {
      cut = i;
      break;
    }
  }

  // 对齐 assistant 边界：批次结束在 cut 之前最后一个 assistant 之后
  let batchEnd = 0;
  for (const end of roundEnds) {
    if (end < cut) {
      batchEnd = end + 1;
    } else {
      break;
    }
  }
  if (batchEnd > 0) return fromIndex + batchEnd;

  // 预算吞掉整区或首个轮次压不进批次，自动路径放弃
  if (!allowYield) return 0;

  // 让步：批次留到倒数第二个轮次末，保留区留住最后一个完整轮次
  if (roundEnds.length < 2) return 0;
  return fromIndex + roundEnds[roundEnds.length - 2]! + 1;
}

/**
 * 启动时的崩溃恢复：扫描全部会话把悬挂的 running 压缩记录改标 interrupted。
 *
 * 只查 id 与 compression_log 两列的轻量 SQL，避免全量加载消息。
 * 此时尚无客户端连接，直接改库不发事件，客户端随后打开会话经
 * HTTP 拿到 interrupted 记录渲染灰字未完成态。
 *
 * @returns 收尾的悬挂记录条数
 */
export function recoverInterruptedCompressions(): number {
  const db = getDb();
  const rows = db
    .query<
      { id: string; compression_log: string },
      []
    >('SELECT id, compression_log FROM sessions WHERE compression_log IS NOT NULL')
    .all();
  let recovered = 0;
  for (const row of rows) {
    let records: CompressionRecord[];
    try {
      records = JSON.parse(row.compression_log) as CompressionRecord[];
    } catch {
      continue;
    }
    if (!Array.isArray(records)) continue;
    let changed = false;
    for (const record of records) {
      if (record && record.state === 'running') {
        record.state = 'interrupted';
        record.reason = 'interrupted';
        changed = true;
        recovered++;
      }
    }
    if (changed) {
      db.query('UPDATE sessions SET compression_log = ? WHERE id = ?').run(
        JSON.stringify(records),
        row.id
      );
    }
  }
  if (recovered > 0) {
    Logger.log('COMPRESS', 'Recovered interrupted compressions', {
      count: recovered,
    });
  }
  return recovered;
}
