/**
 * @file lib/tts-cleaner.ts
 * @description 将 Markdown / HTML 等富文本清理为适合 TTS 朗读的纯净文本
 *
 * 清理策略：
 * - 去除 Markdown 语法（代码块、标题、粗斜体、链接、图片、列表标记）
 * - 去除 HTML 标签
 * - 去除 Emoji 及各类特殊符号
 * - 保留自然语言标点
 */

/**
 * Emoji 及杂项符号 Unicode 范围
 *
 * oxlint 的 no-misleading-character-class 规则对字符类中的
 * Variation Selector (FE0F) 和 Zero Width Joiner (200D) 会误报，
 * 因此使用 RegExp 构造函数来绕过静态分析。
 */
const EMOJI_REGEX = new RegExp(
  '[' +
    '\\u{1F600}-\\u{1F64F}' +
    '\\u{1F300}-\\u{1F5FF}' +
    '\\u{1F680}-\\u{1F6FF}' +
    '\\u{1F1E0}-\\u{1F1FF}' +
    '\\u{2600}-\\u{26FF}' +
    '\\u{2700}-\\u{27BF}' +
    '\\u{FE00}-\\u{FE0F}' +
    '\\u{1F900}-\\u{1F9FF}' +
    '\\u{1FA00}-\\u{1FA6F}' +
    '\\u{1FA70}-\\u{1FAFF}' +
    '\\u{200D}' +
    '\\u{20E3}' +
    '\\u{FE0F}' +
    '\\u{E0020}-\\u{E007F}' +
    ']',
  'gu'
);

/**
 * 将富文本清理为 TTS 可用的纯净文本
 *
 * @param text - 原始文本（可能包含 Markdown / HTML / Emoji 等）
 * @returns 适合语音朗读的纯净文本，保留自然标点
 */
export function cleanForTTS(text: string): string {
  let r = text;

  // HTML tags
  r = r.replace(/<[^>]+>/g, '');

  // Code blocks (fenced)
  r = r.replace(/```[\s\S]*?```/g, '');
  // Inline code
  r = r.replace(/`([^`]+)`/g, '$1');

  // Headings
  r = r.replace(/^#{1,6}\s+/gm, '');

  // Bold / italic
  r = r.replace(/\*\*(.+?)\*\*/g, '$1');
  r = r.replace(/__(.+?)__/g, '$1');
  r = r.replace(/(?<!\w)\*(.+?)\*(?!\w)/g, '$1');
  r = r.replace(/(?<!\w)_(.+?)_(?!\w)/g, '$1');

  // Links [text](url) → text, images → remove
  r = r.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
  r = r.replace(/!\[[^\]]*\]\([^)]+\)/g, '');

  // List markers (- * + and numbered)
  r = r.replace(/^[\s]*[-*+]\s+/gm, '');
  r = r.replace(/^[\s]*\d+\.\s+/gm, '');

  // HTML entities
  r = r.replace(/&nbsp;/gi, ' ');
  r = r.replace(/&amp;/gi, '&');
  r = r.replace(/&lt;/gi, '<');
  r = r.replace(/&gt;/gi, '>');
  r = r.replace(/&quot;/gi, '"');
  r = r.replace(/&#\d+;/g, '');
  r = r.replace(/&\w+;/g, '');

  // Emoji
  r = r.replace(EMOJI_REGEX, '');

  // Special symbols that serve no speech purpose (keep natural punctuation)
  r = r.replace(/[~^|\\@#$%&=+<>{}[\]]/g, '');

  // Collapse whitespace
  r = r.replace(/[ \t]+/g, ' ');
  r = r.replace(/\n{3,}/g, '\n\n');
  r = r.trim();

  return r;
}
