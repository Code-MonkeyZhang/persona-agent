/**
 * @fileoverview Agent 记忆存储：只追加的 history.jsonl + dream 指针。
 *
 * 存储结构：
 * ├── MEMORY.md         # Dream 整理产出的长期记忆
 * ├── history.jsonl     # 每行一条压缩摘要 {cursor, timestamp, content}，只追加
 * └── .dream_cursor     # dream 已整理到的 history 行号
 *
 * 原文从不删除，压缩产出只追加；双指针分别标记原始消息压缩进度
 * 与 dream 整理进度。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAgentMemoryDir } from '../../util/paths.js';

/** history.jsonl 中一条压缩摘要记录 */
export interface HistoryEntry {
  /**
   *     本条摘要覆盖到的原始消息下标。
   * 即该摘要总结了 messages[prev, cursor) 这一段。
   */
  cursor: number;
  timestamp: number;
  content: string;
}

const HISTORY_FILE = 'history.jsonl';
const DREAM_CURSOR_FILE = '.dream_cursor';
const MEMORY_FILE = 'MEMORY.md';
/** `# Recent History` 段注入上限：最多条目数 */
const MAX_HISTORY_ENTRIES = 50;
/** `# Recent History` 段注入上限：最大总字符数 */
const MAX_HISTORY_CHARS = 32000;

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
   *     读取 history.jsonl 中从 `fromIndex` 开始的摘要记录。
   *
   * 配合 `.dream_cursor` 使用：dream 已整理到第 N 条，则传 fromIndex=N，
   * 返回尚未被 dream 整理的"未处理 history"。解析失败的行静默跳过。
   *
   * @param fromIndex - 起始行号
   * @param limit - 最多返回的条数
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
   * 读取 `.dream_cursor`。
   *
   * 文件不存在或无效时返回 0。
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

  /**
   * 推进 `.dream_cursor`。
   *
   * 在当前游标基础上累加 `count` 写入。
   * 即使期间有新的 history 追加进来，它们位于 `cursor + count` 之后，
   * 下次 dream 会正确从新游标读取，不漏不重。
   *
   * @param count - 本批成功整理的条目数
   */
  advanceDreamCursor(count: number): void {
    const next = this.getDreamCursor() + count;
    fs.writeFileSync(
      path.join(this.memoryDir, DREAM_CURSOR_FILE),
      String(next)
    );
  }

  /**
   *     读取 `MEMORY.md`。
   *
   * @returns MEMORY.md 去除首尾空白后的内容；文件不存在时返回空字符串。
   */
  readMemoryMd(): string {
    const filePath = path.join(this.memoryDir, MEMORY_FILE);
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf8').trim();
  }

  /**
   *     覆盖写入 `MEMORY.md`。
   *
   * 采用 tmp + rename 原子写，避免进程中途被杀导致文件损坏。
   *
   * @param content - 新的记忆正文
   */
  writeMemoryMd(content: string): void {
    const filePath = path.join(this.memoryDir, MEMORY_FILE);
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, content);
    fs.renameSync(tmpPath, filePath);
  }

  /**
   * 构建注入 system prompt 的 `# Recent History` 段。
   *
   * 读取 dream_cursor 之后的未处理 history 摘要，最近的优先纳入预算，
   * 收集后再反转回时间顺序拼接返回。
   *
   * @returns 拼接好的摘要文本；无可用条目时返回空字符串。
   */
  readRecentHistorySegment(): string {
    const entries = this.readHistory(this.getDreamCursor());
    if (entries.length === 0) return '';

    const selected: HistoryEntry[] = [];
    let total = 0;
    // 从最新的开始纳入预算，收集后再反转回时间顺序
    for (let i = entries.length - 1; i >= 0; i--) {
      if (selected.length >= MAX_HISTORY_ENTRIES) break;
      const text = entries[i]!.content;
      if (total + text.length > MAX_HISTORY_CHARS) break;
      total += text.length;
      selected.push(entries[i]!);
    }
    selected.reverse();
    return selected.map((e) => e.content).join('\n');
  }
}
