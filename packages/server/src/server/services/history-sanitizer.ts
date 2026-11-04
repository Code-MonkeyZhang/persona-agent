/**
 * @fileoverview 历史构建期过滤：把存储消息投影成发给模型的安全清单。
 *
 * 规则无条件执行，只影响发给模型的清单，存储与界面不动：
 * - error 消息一律不回喂原始报错，已知码换专属短语，未知码换通用短语
 * - 失败回合的附件块换文字占位，用户文字原样保留
 * - 纯附件消息剥空后与短语一起跳过
 */

import type {
  ContentBlock,
  ErrorMessage,
  FileContent,
  ImageContent,
  Message,
  TextContent,
} from '../../schema/index.js';

/** 错误短语表：正则锚定内层 code 字段或开头的状态码前缀，首中即停 */
const ERROR_PHRASES: readonly { test: RegExp; phrase: string }[] = [
  {
    test: /"code"\s*:\s*"1301"|content_filter/i,
    phrase: '上一回合调用失败，内容被审核拒绝',
  },
  {
    test: /^429\b|"code"\s*:\s*"429"/,
    phrase: '上一回合调用失败，限流稍后重试',
  },
  {
    test: /^(?:401|403)\b|"code"\s*:\s*"(?:401|403)"/,
    phrase: '上一回合调用失败，鉴权失败',
  },
];

/** 兜底短语：未识别错误一律落此行，新错误码零改动覆盖 */
const FALLBACK_PHRASE = '上一回合模型调用失败';

/** 过滤统计，供调用方留痕排查 */
export interface SanitizeStats {
  /** 换成净化短语的 error 消息数 */
  errors: number;
  /** 换成占位文字的附件块数 */
  placeholders: number;
  /** 连同短语一起跳过的纯附件消息数 */
  skipped: number;
}

/**
 * 附件块的占位文字。
 * 图片块无名字段用通用占位，文件块带 name 携带真实附件名。
 */
function attachmentPlaceholder(block: ImageContent | FileContent): TextContent {
  const label = block.type === 'image' ? '图片附件' : `文件 ${block.name}`;
  return {
    type: 'text',
    text: `[${label} 未成功处理 如需要请重新发送]`,
  };
}

/** 按短语表把原始报错映射成净化短语，未识别错误落兜底行 */
function phraseFor(rawError: string): string {
  for (const row of ERROR_PHRASES) {
    if (row.test.test(rawError)) return row.phrase;
  }
  return FALLBACK_PHRASE;
}

/**
 * 把失败回合 user 消息里的附件块换成占位文字块，文字块原样保留。
 * 返回新的块数组，原数组与块对象不动。
 */
function replaceBlocks(
  content: ContentBlock[],
  stats: SanitizeStats
): ContentBlock[] {
  return content.map((block) => {
    if (block.type === 'text') return block;
    stats.placeholders += 1;
    return attachmentPlaceholder(block);
  });
}

/**
 * 处理失败回合：error 换净化短语，本回合 user 消息的附件换占位。
 *
 * 纯附件消息没有任何文字块，剥空后从清单移除；
 * 本回合 user 消息全部剥空时短语一并跳过，否则短语占助手槽位。
 */
function sanitizeFailedTurn(
  result: Message[],
  turnStart: number,
  error: ErrorMessage,
  stats: SanitizeStats
): void {
  let userSeen = false;
  let userSurvived = false;
  // 倒序扫描本回合切片，删除纯附件消息时后续下标不漂移
  for (let i = result.length - 1; i >= turnStart; i--) {
    const msg = result[i];
    if (msg.role !== 'user') continue;
    userSeen = true;
    if (typeof msg.content === 'string') {
      userSurvived = true;
      continue;
    }
    const { content } = msg;
    if (!content.some((block) => block.type === 'text')) {
      result.splice(i, 1);
      stats.skipped += 1;
      continue;
    }
    result[i] = { ...msg, content: replaceBlocks(content, stats) };
    userSurvived = true;
  }
  if (userSeen && !userSurvived) return;
  result.push({ role: 'error', content: phraseFor(error.content) });
  stats.errors += 1;
}

/**
 * 把存储历史投影成发给模型的安全清单。
 *
 * 顺序扫描，成功边界与 error 消息都终结回合。净化只作用于返回的
 * 副本，入参数组与其中的消息对象不变。
 *
 * @param messages - 待加载的存储消息切片
 * @param turnEnds - 会话的回合边界，值为各边界之前的消息总数
 * @param offset - 切片首条在完整消息序列中的下标，用于换算边界
 * @returns 净化后的消息数组与统计
 */
export function sanitizeHistoryForModel(
  messages: Message[],
  turnEnds: readonly number[],
  offset: number
): { messages: Message[]; stats: SanitizeStats } {
  const stats: SanitizeStats = { errors: 0, placeholders: 0, skipped: 0 };
  const result: Message[] = [];
  // 切片内的成功边界：边界值减偏移得切片下标，落在切片内的才有效
  const boundaries = new Set(
    turnEnds.map((t) => t - offset).filter((b) => b > 0 && b < messages.length)
  );

  let turnStart = 0;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (msg.role === 'error') {
      sanitizeFailedTurn(result, turnStart, msg, stats);
      turnStart = result.length;
      continue;
    }
    result.push(msg);
    if (boundaries.has(i + 1)) turnStart = result.length;
  }

  return { messages: result, stats };
}
