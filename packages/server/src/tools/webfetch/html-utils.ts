/**
 * @fileoverview HTML 安全清洗、格式转换、响应体流式读取。
 *
 * - sanitizeHtml: 移除隐藏元素（display:none, visibility:hidden, opacity:0, hidden class 等）
 * - stripInvisibleUnicode: 移除零宽字符等不可见 Unicode
 * - htmlToMarkdown: 用 turndown 将清洗后的 HTML 转为 Markdown
 * - markdownToText: 剥离 Markdown 语法，只保留纯文本
 * - readResponseText: 流式读取响应体，支持字节数上限截断
 */

import TurndownService from 'turndown';

// ---------------------------------------------------------------------------
// Hidden element detection (ported from openclaw web-fetch-visibility.ts)
// ---------------------------------------------------------------------------

const HIDDEN_STYLE_PATTERNS: Array<[string, RegExp]> = [
  ['display', /^\s*none\s*$/i],
  ['visibility', /^\s*hidden\s*$/i],
  ['opacity', /^\s*0\s*$/],
  ['font-size', /^\s*0(px|em|rem|pt|%)?\s*$/i],
  ['text-indent', /^\s*-\d{4,}px\s*$/],
  ['color', /^\s*transparent\s*$/i],
  [
    'color',
    /^\s*rgba\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.0+)?\s*\)\s*$/i,
  ],
  [
    'color',
    /^\s*hsla\s*\(\s*[\d.]+\s*,\s*[\d.]+%?\s*,\s*[\d.]+%?\s*,\s*0(?:\.0+)?\s*\)\s*$/i,
  ],
];

const HIDDEN_CLASS_NAMES = new Set([
  'sr-only',
  'visually-hidden',
  'd-none',
  'hidden',
  'invisible',
  'screen-reader-only',
  'offscreen',
]);

const HTML_VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

function hasHiddenClass(className: string): boolean {
  const classes = className.toLowerCase().split(/\s+/);
  return classes.some((cls) => HIDDEN_CLASS_NAMES.has(cls));
}

/**
 * 检查 CSS style 字符串是否表示元素被隐藏。
 * 涵盖 display:none, visibility:hidden, opacity:0, clip-path 裁剪,
 * transform:scale(0)/translate 偏移, width:0+height:0+overflow:hidden, offscreen 定位等。
 */
function isStyleHidden(style: string): boolean {
  for (const [prop, pattern] of HIDDEN_STYLE_PATTERNS) {
    const escapedProp = prop.replace(/-/g, '\\-');
    const match = style.match(
      new RegExp(`(?:^|;)\\s*${escapedProp}\\s*:\\s*([^;]+)`, 'i')
    );
    if (match && pattern.test(match[1])) return true;
  }

  const clipPath = style.match(/(?:^|;)\s*clip-path\s*:\s*([^;]+)/i);
  if (clipPath && !/^\s*none\s*$/i.test(clipPath[1])) {
    if (/inset\s*\(\s*(?:0*\.\d+|[1-9]\d*(?:\.\d+)?)%/i.test(clipPath[1]))
      return true;
  }

  const transform = style.match(/(?:^|;)\s*transform\s*:\s*([^;]+)/i);
  if (transform) {
    if (/scale\s*\(\s*0\s*\)/i.test(transform[1])) return true;
    if (/translateX\s*\(\s*-\d{4,}px\s*\)/i.test(transform[1])) return true;
    if (/translateY\s*\(\s*-\d{4,}px\s*\)/i.test(transform[1])) return true;
  }

  const width = style.match(/(?:^|;)\s*width\s*:\s*([^;]+)/i);
  const height = style.match(/(?:^|;)\s*height\s*:\s*([^;]+)/i);
  const overflow = style.match(/(?:^|;)\s*overflow\s*:\s*([^;]+)/i);
  if (
    width &&
    /^\s*0(px)?\s*$/i.test(width[1]) &&
    height &&
    /^\s*0(px)?\s*$/i.test(height[1]) &&
    overflow &&
    /^\s*hidden\s*$/i.test(overflow[1])
  )
    return true;

  const left = style.match(/(?:^|;)\s*left\s*:\s*([^;]+)/i);
  if (left && /^\s*-\d{4,}px\s*$/i.test(left[1])) return true;
  const top = style.match(/(?:^|;)\s*top\s*:\s*([^;]+)/i);
  if (top && /^\s*-\d{4,}px\s*$/i.test(top[1])) return true;

  return false;
}

function readAttribute(attrs: string, name: string): string | undefined {
  const escapedName = name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  const unquotedAttributeValue = '[^\\s"\'=<>`]+';
  const match = attrs.match(
    new RegExp(
      `(?:^|\\s)${escapedName}(?:\\s*=\\s*(?:"([^"]*)"|'([^']*)'|(${unquotedAttributeValue})))?`,
      'i'
    )
  );
  if (!match) return undefined;
  return match[1] ?? match[2] ?? match[3] ?? '';
}

function hasAttribute(attrs: string, name: string): boolean {
  return readAttribute(attrs, name) !== undefined;
}

function shouldRemoveElement(tagName: string, attrs: string): boolean {
  if (
    ['meta', 'template', 'svg', 'canvas', 'iframe', 'object', 'embed'].includes(
      tagName
    )
  ) {
    return true;
  }
  if (
    tagName === 'input' &&
    readAttribute(attrs, 'type')?.toLowerCase() === 'hidden'
  )
    return true;
  if (readAttribute(attrs, 'aria-hidden')?.toLowerCase() === 'true')
    return true;
  if (hasAttribute(attrs, 'hidden')) return true;
  const className = readAttribute(attrs, 'class') ?? '';
  if (className && hasHiddenClass(className)) return true;
  const style = readAttribute(attrs, 'style') ?? '';
  if (style && isStyleHidden(style)) return true;
  return false;
}

// ---------------------------------------------------------------------------
// HTML tag tokenizer
// ---------------------------------------------------------------------------

type HtmlTagToken = {
  tagName: string;
  attrs: string;
  closing: boolean;
  selfClosing: boolean;
};

/** 在 HTML 字符串中从 start 位置开始找到标签的结束 `>` 位置，感知引号。 */
function findTagEnd(html: string, start: number): number {
  let quote: '"' | "'" | undefined;
  for (let i = start + 1; i < html.length; i++) {
    const char = html[i];
    if (quote) {
      if (char === quote) quote = undefined;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '>') return i;
  }
  return -1;
}

function readTagName(
  source: string,
  start: number
): { tagName: string; end: number } | null {
  let end = start;
  while (end < source.length) {
    const code = source.charCodeAt(end);
    const isNameChar =
      (code >= 65 && code <= 90) ||
      (code >= 97 && code <= 122) ||
      (code >= 48 && code <= 57) ||
      source[end] === '-' ||
      source[end] === '_' ||
      source[end] === ':';
    if (!isNameChar) break;
    end++;
  }
  if (end === start) return null;
  return { tagName: source.slice(start, end).toLowerCase(), end };
}

function parseHtmlTagToken(token: string): HtmlTagToken | null {
  let inner = token.slice(1, -1).trim();
  if (!inner || inner.startsWith('!') || inner.startsWith('?')) return null;

  const closing = inner.startsWith('/');
  if (closing) inner = inner.slice(1).trimStart();

  const name = readTagName(inner, 0);
  if (!name) return null;

  const attrs = closing ? '' : inner.slice(name.end);
  return {
    tagName: name.tagName,
    attrs,
    closing,
    selfClosing: !closing && attrs.trimEnd().endsWith('/'),
  };
}

function popDroppedElement(dropStack: string[], tagName: string): void {
  const index = dropStack.lastIndexOf(tagName);
  if (index >= 0) dropStack.length = index;
}

/**
 * 从 HTML 中移除隐藏元素。
 *
 * 使用简易 HTML tokenizer 逐标签扫描。当一个开标签被判定为隐藏时，
 * 其所有子内容被丢弃，直到匹配的闭标签出现（dropStack 机制）。
 */
function removeMarkedElements(html: string): string {
  let output = '';
  let cursor = 0;
  const dropStack: string[] = [];

  while (cursor < html.length) {
    const tagStart = html.indexOf('<', cursor);
    if (tagStart < 0) {
      if (dropStack.length === 0) output += html.slice(cursor);
      break;
    }

    if (dropStack.length === 0) output += html.slice(cursor, tagStart);

    // Skip comments
    if (html.startsWith('<!--', tagStart)) {
      const commentEnd = html.indexOf('-->', tagStart + 4);
      cursor = commentEnd < 0 ? html.length : commentEnd + 3;
      continue;
    }

    const tagEnd = findTagEnd(html, tagStart);
    if (tagEnd < 0) {
      if (dropStack.length === 0) output += html.slice(tagStart);
      break;
    }

    const token = html.slice(tagStart, tagEnd + 1);
    const parsed = parseHtmlTagToken(token);
    if (!parsed) {
      if (dropStack.length === 0) output += token;
      cursor = tagEnd + 1;
      continue;
    }

    if (dropStack.length > 0) {
      if (parsed.closing) {
        popDroppedElement(dropStack, parsed.tagName);
      } else if (
        !parsed.selfClosing &&
        !HTML_VOID_ELEMENTS.has(parsed.tagName)
      ) {
        dropStack.push(parsed.tagName);
      }
      cursor = tagEnd + 1;
      continue;
    }

    if (parsed.closing) {
      output += token;
    } else if (shouldRemoveElement(parsed.tagName, parsed.attrs)) {
      if (!parsed.selfClosing && !HTML_VOID_ELEMENTS.has(parsed.tagName)) {
        dropStack.push(parsed.tagName);
      }
    } else {
      output += token;
    }
    cursor = tagEnd + 1;
  }

  return output;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** 清洗 HTML：移除隐藏元素、script/style/noscript 标签。 */
export function sanitizeHtml(html: string): string {
  let clean = removeMarkedElements(html);
  clean = clean.replace(/<script[\s\S]*?<\/script>/gi, '');
  clean = clean.replace(/<style[\s\S]*?<\/style>/gi, '');
  clean = clean.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  return clean;
}

const INVISIBLE_UNICODE_RE =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u206A-\u206F\uFEFF\u{E0000}-\u{E007F}]/gu;

/** 移除零宽字符、方向控制字符等不可见 Unicode。 */
export function stripInvisibleUnicode(text: string): string {
  return text.replace(INVISIBLE_UNICODE_RE, '');
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) =>
      String.fromCharCode(Number.parseInt(hex, 16))
    )
    .replace(/&#(\d+);/gi, (_, dec) =>
      String.fromCharCode(Number.parseInt(dec, 10))
    );
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, ''));
}

export function normalizeWhitespace(value: string): string {
  return value
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/** 从 HTML 中提取 `<title>` 标签内容。 */
export function extractTitle(html: string): string | undefined {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return undefined;
  return normalizeWhitespace(stripTags(match[1])) || undefined;
}

const turndown = new TurndownService({ headingStyle: 'atx' });
turndown.remove(['script', 'style', 'noscript']);

/** 将 HTML 转为 Markdown：先清洗再用 turndown 转换。 */
export function htmlToMarkdown(html: string): string {
  const clean = sanitizeHtml(html);
  const md = turndown.turndown(clean);
  return normalizeWhitespace(md);
}

/** 将 Markdown 转为纯文本：剥离链接、标题、代码块、列表标记等。 */
export function markdownToText(markdown: string): string {
  let text = markdown;
  text = text.replace(/!\[[^\]]*]\([^)]+\)/g, '');
  text = text.replace(/\[([^\]]+)]\([^)]+\)/g, '$1');
  text = text.replace(/```[\s\S]*?```/g, (block) =>
    block.replace(/```[^\n]*\n?/g, '').replace(/```/g, '')
  );
  text = text.replace(/`([^`]+)`/g, '$1');
  text = text.replace(/^#{1,6}\s+/gm, '');
  text = text.replace(/^\s*[-*+]\s+/gm, '');
  text = text.replace(/^\s*\d+\.\s+/gm, '');
  return normalizeWhitespace(text);
}

export function truncateText(
  value: string,
  maxChars: number
): { text: string; truncated: boolean } {
  if (value.length <= maxChars) return { text: value, truncated: false };
  return { text: value.slice(0, maxChars), truncated: true };
}

// ---------------------------------------------------------------------------
// Stream-based response body reader
// ---------------------------------------------------------------------------

export type ReadResponseTextResult = {
  text: string;
  truncated: boolean;
  bytesRead: number;
};

/**
 * 流式读取 Response 的文本内容，支持字节上限截断。
 * 超过 maxBytes 时截断并标记 truncated。
 */
export async function readResponseText(
  res: Response,
  options?: { maxBytes?: number }
): Promise<ReadResponseTextResult> {
  const maxBytesRaw = options?.maxBytes;
  const maxBytes =
    typeof maxBytesRaw === 'number' &&
    Number.isFinite(maxBytesRaw) &&
    maxBytesRaw > 0
      ? Math.floor(maxBytesRaw)
      : undefined;

  const body = (res as unknown as { body?: unknown }).body;
  if (
    maxBytes &&
    body &&
    typeof body === 'object' &&
    'getReader' in body &&
    typeof (body as { getReader: () => unknown }).getReader === 'function'
  ) {
    const reader = (body as ReadableStream<Uint8Array>).getReader();
    const decoder = new TextDecoder();
    let bytesRead = 0;
    let truncated = false;
    const parts: string[] = [];

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value || value.byteLength === 0) continue;

        let chunk = value;
        if (bytesRead + chunk.byteLength > maxBytes) {
          const remaining = Math.max(0, maxBytes - bytesRead);
          if (remaining <= 0) {
            truncated = true;
            break;
          }
          chunk = chunk.subarray(0, remaining);
          truncated = true;
        }

        bytesRead += chunk.byteLength;
        parts.push(decoder.decode(chunk, { stream: true }));

        if (truncated || bytesRead >= maxBytes) {
          truncated = true;
          break;
        }
      }
    } catch {
      // Best-effort: return whatever we decoded so far.
    } finally {
      if (truncated) {
        void reader.cancel().catch(() => undefined);
      }
    }

    parts.push(decoder.decode());
    return { text: parts.join(''), truncated, bytesRead };
  }

  try {
    const text = await res.text();
    return { text, truncated: false, bytesRead: text.length };
  } catch {
    return { text: '', truncated: false, bytesRead: 0 };
  }
}
