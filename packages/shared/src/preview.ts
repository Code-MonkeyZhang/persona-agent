/** 预览文本截断长度上界，UI 层自带 truncate 样式，此处只约束 payload 大小 */
const PREVIEW_MAX_LENGTH = 80;

/**
 * 把消息原文清洗为会话列表预览文本。
 *
 * - 去除 HTML 标签，避免富文本标记进入单行预览
 * - trim 后按字符截断，超长部分直接舍弃
 */
export function buildPreviewText(text: string): string {
  return text
    .replace(/<[^>]+>/g, '')
    .trim()
    .slice(0, PREVIEW_MAX_LENGTH);
}
