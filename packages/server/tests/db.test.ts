/**
 * @fileoverview DB 建库骨架测试。
 */

import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import * as fs from 'node:fs';
import { rmTempDir } from './temp-cleanup.js';
import * as path from 'node:path';
import * as os from 'node:os';

/** 临时测试目录 */
let tempDir: string;
/** 测试库文件路径 */
let dbPath: string;

mock.module('../src/util/paths.js', () => ({
  getDbPath: () => dbPath,
}));

import { getDb, closeDb } from '../src/db/index.js';
import { SCHEMA_VERSION } from '../src/db/schema.js';

/** 首批建库应出现的全部表 */
const EXPECTED_TABLES = [
  'agents',
  'apps',
  'attachments',
  'devices',
  'jobs',
  'kv',
  'messages',
  'read_state',
  'sessions',
];

describe('db bootstrap', () => {
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-test-'));
    dbPath = path.join(tempDir, 'persona.db');
  });

  afterAll(() => {
    closeDb();
    rmTempDir(tempDir);
  });

  /** 测试九张表全部建齐 */
  it('should create all nine tables', () => {
    const names = getDb()
      .query<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
      )
      .all()
      .map((row) => row.name);
    for (const table of EXPECTED_TABLES) {
      expect(names).toContain(table);
    }
  });

  /** 测试 user_version 等于 SCHEMA_VERSION */
  it('should write SCHEMA_VERSION into user_version', () => {
    const row = getDb()
      .query<{ user_version: number }>('PRAGMA user_version')
      .get();
    expect(row?.user_version).toBe(SCHEMA_VERSION);
  });

  /** 测试 journal_mode 为 wal */
  it('should enable WAL journal mode', () => {
    const row = getDb()
      .query<{ journal_mode: string }>('PRAGMA journal_mode')
      .get();
    expect(row?.journal_mode).toBe('wal');
  });

  /** 测试重复 getDb 幂等且不破坏已有数据 */
  it('should be idempotent across repeated getDb calls', () => {
    getDb().run('INSERT INTO kv (key, value) VALUES (?, ?)', 'k', 'v');

    const first = getDb();
    const second = getDb();
    expect(second).toBe(first);

    const row = getDb()
      .query<{ value: string }>('SELECT value FROM kv WHERE key = ?')
      .get('k');
    expect(row?.value).toBe('v');
  });

  /** 测试 closeDb 后重开数据仍在 */
  it('should keep data after closeDb and reopen', () => {
    getDb().run('INSERT INTO kv (key, value) VALUES (?, ?)', 'persist', '1');
    closeDb();

    const row = getDb()
      .query<{ value: string }>('SELECT value FROM kv WHERE key = ?')
      .get('persist');
    expect(row?.value).toBe('1');
  });
});
