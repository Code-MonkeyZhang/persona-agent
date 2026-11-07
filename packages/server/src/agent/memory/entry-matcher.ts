/**
 * @fileoverview 触发记忆的扫描窗口与匹配判定，纯函数无 IO 无状态。
 *
 * 匹配走朴素文本查找，全程不构造任何正则。调查过三家世界书实现，
 * 默认路径上没有一家把用户随手写的触发词主动构造成正则，朴素查找
 * 是这个功能人群的主流做法，触发词里的正则特殊字符只是普通字符。
 * 整词边界容许英文复数词尾，postcard 可命中 postcards。
 */
import type { MemoryEntry } from '@persona/shared';
import type { Message } from '../../schema/index.js';
import { messageContentText } from './token-estimate.js';

/** 词内字符判定用的字符集，小写字母数字下划线，与 grep 整词语义一致 */
const WORD_CHARS = /[a-z0-9_]/;

/**
 * 判断某位置的邻字符是否属于词内字符。
 *
 * 中文不属于词内字符，天然处处边界，等效包含匹配。
 */
function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && WORD_CHARS.test(ch);
}

/**
 * 单词触发词的整词查找。
 *
 * 先用 indexOf 找到出现位置，再看前一字符与后侧边界是否成立，
 * 前侧不在词内且后侧整词即命中。贴着文本开头或结尾视为边界成立，
 * cat 不命中 concatenate 也不命中 my_cat，但容许复数词尾命中 cats。
 */
function matchWord(haystack: string, word: string): boolean {
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(word, from);
    if (at === -1) return false;
    const before = at > 0 ? haystack[at - 1] : undefined;
    if (!isWordChar(before) && boundaryAfter(haystack, at + word.length)) {
      return true;
    }
    from = at + 1;
  }
}

/**
 * 判定匹配终点之后是否整词边界，容许一个英文复数词尾。
 *
 * 终点后直接是边界或文末即成立，终点后恰为 s 或 es 且其后是边界
 * 时视为同一词的复数形式同样成立，其余情况不成立。
 */
function boundaryAfter(haystack: string, end: number): boolean {
  const wordCharAt = (i: number): boolean => {
    const ch = i < haystack.length ? haystack[i] : undefined;
    return ch !== undefined && WORD_CHARS.test(ch);
  };
  if (!wordCharAt(end)) return true;
  for (const suffix of ['es', 's']) {
    if (haystack.startsWith(suffix, end) && !wordCharAt(end + suffix.length)) {
      return true;
    }
  }
  return false;
}

/**
 * 单条触发词的命中判定。
 *
 * 含空格的短语直接包含匹配不做边界判断，单词走整词边界判断。
 * 调用方保证传入的 key 与扫描文本都已转小写。
 */
function keyHits(key: string, scanText: string): boolean {
  return key.includes(' ') ? scanText.includes(key) : matchWord(scanText, key);
}

/**
 * 从 session 消息取扫描文本。
 *
 * 倒序收集 role 为 user 或 assistant 的最近两条有文本消息，再正序拼接。
 * context、app_notification、system、error 角色一律不进窗口，context 消息
 * 的环境变化文字不会造成假命中。拼接在两条消息中间放换行符，防止某词
 * 前半段与后半段分居两条消息在接缝处拼成假词。
 *
 * @param messages - session 的原始角色消息
 * @returns 拼接好的扫描文本；无可用消息时为空串
 */
export function buildScanText(messages: Message[]): string {
  const picked: string[] = [];
  for (let i = messages.length - 1; picked.length < 2 && i >= 0; i--) {
    const msg = messages[i]!;
    if (msg.role !== 'user' && msg.role !== 'assistant') continue;
    const text = messageContentText(msg).trim();
    if (text) picked.push(text);
  }
  return picked.reverse().join('\n');
}

/**
 * 命中判定，返回命中条目。
 *
 * 大小写全程不敏感，双方转小写再比；命中全量返回无上限。
 * 传入条目应已按编号升序，filter 保序，输出顺序即注入顺序。
 *
 * @param entries - 候选的触发启用条目，编号升序
 * @param scanText - buildScanText 产出的扫描文本
 * @returns 命中的条目，按传入顺序
 */
export function matchTriggered(
  entries: MemoryEntry[],
  scanText: string
): MemoryEntry[] {
  if (!scanText || entries.length === 0) return [];
  const text = scanText.toLowerCase();
  return entries.filter((entry) =>
    entry.keys.some((raw) => {
      const key = raw.trim().toLowerCase();
      return key.length > 0 && keyHits(key, text);
    })
  );
}
