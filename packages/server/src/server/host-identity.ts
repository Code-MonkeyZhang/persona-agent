/**
 * @fileoverview 服务端主机身份的首启生成与读取。
 *
 * 身份只识别不验证：hostId 首次调用生成 UUID 存 kv 的 host_id，
 * hostName 取 OS hostname 存 host_name 作为自称名默认值。
 * 幂等可重复调用，身份生成后跨重启保持不变。
 */

import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { Database } from 'bun:sqlite';
import { getDb } from '../db/index.js';
import { Logger } from '../util/logger.js';

/** kv 表的键名 */
const HOST_ID_KEY = 'host_id';
const HOST_NAME_KEY = 'host_name';

/** 进程内缓存，生成或读取一次后复用 */
let cached: { hostId: string; hostName: string } | null = null;

/**
 * 取主机身份，首次调用时生成并落 kv。
 * 重复调用返回同一身份，不产生新的写入。
 */
export function getHostIdentity(): { hostId: string; hostName: string } {
  if (cached) return cached;

  const db = getDb();
  const hostId = readOrCreate(db, HOST_ID_KEY, () => randomUUID());
  const hostName = readOrCreate(db, HOST_NAME_KEY, () => hostname());
  cached = { hostId, hostName };
  return cached;
}

/**
 * 读 kv 键值，缺失时用生成函数补齐并写入。
 * 单进程同步库访问，读与写之间不存在竞争。
 */
function readOrCreate(
  db: Database,
  key: string,
  generate: () => string
): string {
  const row = db
    .query<{ value: string }, [string]>('SELECT value FROM kv WHERE key = ?')
    .get(key);
  if (row) return row.value;

  const value = generate();
  db.query('INSERT INTO kv (key, value) VALUES (?, ?)').run(key, value);
  Logger.log('HOST', `Generated ${key} for this host`);
  return value;
}
