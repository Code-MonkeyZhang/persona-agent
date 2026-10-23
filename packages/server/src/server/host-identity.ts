/**
 * @fileoverview 服务端主机身份的首启生成与读取。
 *
 * 身份只识别不验证：hostId 首次调用生成 UUID 存 kv 的 host_id，
 * hostName 取 OS 层对用户友好的电脑名存 host_name 作为自称名默认值。
 * 幂等可重复调用，身份生成后跨重启保持不变，
 * 存量自称名还是 macOS 的 mDNS 派生名时一次性自愈为友好名。
 */

import { execSync } from 'node:child_process';
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
 * 取本机的自称名。
 * macOS 上 os hostname 返回的是 mDNS 派生名，拼音化且带 .local 后缀，
 * 用 scutil 取用户设置的电脑名，取不到再退回 hostname。
 * Windows 与 Linux 的 hostname 本来就是用户起的名，直接采用。
 */
export function detectHostName(): string {
  if (process.platform === 'darwin') {
    try {
      const name = execSync('scutil --get ComputerName', {
        encoding: 'utf-8',
      }).trim();
      if (name) {
        return name;
      }
    } catch {
      Logger.log('HOST', 'scutil unavailable, falling back to os hostname');
    }
  }
  return hostname();
}

/** 存量自称名是否为 macOS 的 mDNS 派生名 */
function isDerivedLocalName(name: string): boolean {
  return process.platform === 'darwin' && name.endsWith('.local');
}

/**
 * 取主机身份，首次调用时生成并落 kv。
 * 重复调用返回同一身份，不产生新的写入。
 */
export function getHostIdentity(): { hostId: string; hostName: string } {
  if (cached) return cached;

  const db = getDb();
  const hostId = readOrCreate(db, HOST_ID_KEY, () => randomUUID());
  let hostName = readOrCreate(db, HOST_NAME_KEY, detectHostName);
  if (isDerivedLocalName(hostName)) {
    const friendly = detectHostName();
    if (friendly !== hostName) {
      hostName = friendly;
      db.query('UPDATE kv SET value = ? WHERE key = ?').run(
        hostName,
        HOST_NAME_KEY
      );
      Logger.log('HOST', 'Refreshed host_name from mDNS derived name');
    }
  }
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
