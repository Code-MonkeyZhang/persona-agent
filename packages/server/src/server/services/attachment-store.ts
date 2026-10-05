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
}

/**
 * 保存一份附件内容。
 * 目标文件已存在则跳过写盘，表行 INSERT OR IGNORE，返回内容身份。
 */
export function saveAttachment(buffer: Buffer, format: string): AttachmentMeta {
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
    `Saved attachment ${hash} format=${format} size=${buffer.length}${deduplicated ? ' deduplicated' : ''}`
  );
  return { hash, format, size: buffer.length };
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
