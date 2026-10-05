/**
 * @fileoverview SQLite 库连接生命周期。
 *
 * 全进程共用一个惰性单例连接，AUTOINCREMENT 序号分配不存在写入竞争。
 * 测试经 mock.module 替换 paths 的 getDbPath，拿到各自的临时库。
 */

import { Database } from 'bun:sqlite';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getDbPath } from '../util/paths.js';
import { Logger } from '../util/logger.js';
import { CREATE_TABLES_SQL, SCHEMA_VERSION } from './schema.js';

/** 模块级单例连接，null 表示尚未打开。 */
let db: Database | null = null;

/**
 * 获取库连接，首次调用时完成建库。
 *
 * - 打开前确保父目录存在，打开后设 WAL 与外键约束
 * - 建表与版本写入在同一个事务里完成
 * - user_version 只前进不回退，版本更高的库原样保留
 */
export function getDb(): Database {
  if (db) return db;

  const dbPath = getDbPath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const conn = new Database(dbPath);
  conn.query<unknown, []>('PRAGMA journal_mode = WAL').run();
  conn.query<unknown, []>('PRAGMA foreign_keys = ON').run();

  const currentVersion = readUserVersion(conn);
  conn.transaction(() => {
    conn.run(CREATE_TABLES_SQL);
    if (currentVersion < SCHEMA_VERSION) {
      conn.run(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    }
  })();

  if (currentVersion < SCHEMA_VERSION) {
    Logger.log(
      'DB',
      `Initialized ${dbPath}, schema version ${currentVersion} -> ${SCHEMA_VERSION}`
    );
  }
  db = conn;
  return conn;
}

/** 关闭连接并清空单例，供测试清理。 */
export function closeDb(): void {
  db?.close();
  db = null;
}

/** 读取 PRAGMA user_version 的当前值。 */
function readUserVersion(conn: Database): number {
  const row = conn
    .query<{ user_version: number }, []>('PRAGMA user_version')
    .get();
  return row?.user_version ?? 0;
}
