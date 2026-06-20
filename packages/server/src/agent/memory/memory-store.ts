/**
 * @fileoverview Agent 记忆存储：只追加的 history.jsonl + dream 指针。
 *
 * 存储结构（位于 `agents/{agentId}/memory/`）：
 * ├── history.jsonl     # 每行一条压缩摘要 {cursor, timestamp, content}，只追加
 * └── .dream_cursor     # dream 已整理到的 history 行号（第三阶段写入）
 *
 * 原文从不删除，压缩产出只追加；双指针分别标记原始消息压缩进度
 * （SessionMeta.summarizedUpTo）与 dream 整理进度（.dream_cursor）。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAgentMemoryDir } from '../../util/paths.js';

/** history.jsonl 中一条压缩摘要记录 */
export interface HistoryEntry {
  /**
   * 本条摘要覆盖到的原始消息下标（压缩后的 summarizedUpTo 高水位）。
   * 即该摘要总结了 messages[prev, cursor) 这一段。
   */
  cursor: number;
  timestamp: number;
  content: string;
}

const HISTORY_FILE = 'history.jsonl';
const DREAM_CURSOR_FILE = '.dream_cursor';

export class MemoryStore {
  private readonly memoryDir: string;

  constructor(agentId: string) {
    this.memoryDir = getAgentMemoryDir(agentId);
    if (!fs.existsSync(this.memoryDir)) {
      fs.mkdirSync(this.memoryDir, { recursive: true });
    }
  }

  /** 追加一条压缩摘要到 history.jsonl
   * @param entry - 要追加的摘要记录
   */
  appendHistory(entry: HistoryEntry): void {
    const filePath = path.join(this.memoryDir, HISTORY_FILE);
    fs.appendFileSync(filePath, JSON.stringify(entry) + '\n');
  }

  /**
   * 读取 history.jsonl 中从 `fromIndex`（行号，0 基）开始的摘要记录。
   *
   * 配合 `.dream_cursor` 使用：dream 已整理到第 N 条，则传 fromIndex=N，
   * 返回尚未被 dream 整理的"未处理 history"。解析失败的行静默跳过。
   *
   * @param fromIndex - 起始行号（默认 0，即全部）
   * @param limit - 最多返回的条数（默认不限）
   * @returns 从 fromIndex 开始的摘要记录数组
   */
  readHistory(fromIndex = 0, limit?: number): HistoryEntry[] {
    const filePath = path.join(this.memoryDir, HISTORY_FILE);
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter((l) => l.trim());
    const entries: HistoryEntry[] = [];
    for (let i = fromIndex; i < lines.length; i++) {
      try {
        entries.push(JSON.parse(lines[i]) as HistoryEntry);
      } catch {
        continue;
      }
      if (limit !== undefined && entries.length >= limit) break;
    }
    return entries;
  }

  /**
   * 读取 `.dream_cursor`（dream 已整理到的 history 行号）。
   *
   * 文件不存在或无效时返回 0（即全部 history 都尚未被 dream 整理）。
   *
   * @returns dream 已整理到的 history 行号；无有效文件时返回 0
   */
  getDreamCursor(): number {
    const filePath = path.join(this.memoryDir, DREAM_CURSOR_FILE);
    if (!fs.existsSync(filePath)) return 0;
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  }
}
