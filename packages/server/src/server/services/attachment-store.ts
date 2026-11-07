/**
 * @fileoverview 聊天附件的哈希存储。
 *
 * 附件文件按内容哈希落在 attachments 目录，attachments 表登记哈希与元信息。
 * 文件与表行任一半边缺失时另半边自愈，重复内容不占第二份空间。
 */

import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SQLQueryBindings } from 'bun:sqlite';
import { getDb } from '../../db/index.js';
import { getAttachmentsDir } from '../../util/paths.js';
import { Logger } from '../../util/logger.js';

/** 附件的存储元信息，哈希即下载地址。 */
export interface AttachmentMeta {
  hash: string;
  format: string;
  size: number;
  /** 清洗后的原始文件名，随消息块走，磁盘文件名仍是纯哈希 */
  name: string;
}

/** 清洗后的文件名允许保留的最大长度 */
const MAX_NAME_LENGTH = 120;

/** 清洗后为空时使用的兜底名 */
const FALLBACK_NAME = 'attachment';

/**
 * 清洗用户上传的原始文件名。
 *
 * - 取 basename 剥离路径，正反斜杠都认
 * - 剥离控制字符，文件系统非法字符替换为下划线
 * - 连续空白折叠为单空格，超长截断
 *
 * @param originalName - 客户端上传声明的原始文件名
 * @returns 可安全展示与下载命名的清洗名
 */
function sanitizeAttachmentName(originalName: string): string {
  const base = originalName.split(/[\\/]/).pop() ?? '';
  const name = base
    .replace(/\p{Cc}/gu, '')
    .replace(/[/\\:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LENGTH);
  return name.length > 0 ? name : FALLBACK_NAME;
}

/**
 * 保存一份附件内容。
 * 收到的字节原样落盘，不检查类型不解析内容。
 * 目标文件已存在则跳过写盘，表行 INSERT OR IGNORE，返回内容身份。
 */
export function saveAttachment(
  buffer: Buffer,
  format: string,
  originalName: string
): AttachmentMeta {
  const name = sanitizeAttachmentName(originalName);
  const hash = createHash('sha256').update(buffer).digest('hex');
  const dir = getAttachmentsDir();
  const filePath = path.join(dir, hash);
  const deduplicated = fs.existsSync(filePath);
  if (!deduplicated) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, buffer);
  }
  getDb()
    .query(
      'INSERT OR IGNORE INTO attachments (hash, format, size, created_at) VALUES (?, ?, ?, ?)'
    )
    .run(hash, format, buffer.length, Date.now());
  Logger.log(
    'ATTACHMENT',
    `Saved attachment ${hash} format=${format} size=${buffer.length} name=${name}${deduplicated ? ' deduplicated' : ''}`
  );
  return { hash, format, size: buffer.length, name };
}

/**
 * 按哈希取附件的下载信息。
 * 表行或文件任一缺失返回 null。
 */
export function getAttachment(
  hash: string
): { filePath: string; format: string } | null {
  const row = getDb()
    .query<
      { format: string },
      SQLQueryBindings[]
    >('SELECT format FROM attachments WHERE hash = ?')
    .get(hash);
  if (!row) return null;
  const filePath = path.join(getAttachmentsDir(), hash);
  if (!fs.existsSync(filePath)) return null;
  return { filePath, format: row.format };
}
