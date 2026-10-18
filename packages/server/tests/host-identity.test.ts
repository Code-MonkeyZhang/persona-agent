/**
 * @fileoverview Tests for host identity friendly name and legacy self-heal.
 *
 * Seeds a legacy mDNS derived host_name into kv before the first identity
 * call, then verifies the derived name is refreshed to the friendly one and
 * the identity stays idempotent afterwards.
 */

import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { rmTempDir } from './temp-cleanup.js';

/** 临时测试目录 */
let tempDir: string;
/** 测试库文件路径 */
let dbPath: string;

mock.module('../src/util/paths.js', () => ({
  getDbPath: () => dbPath,
}));

import { getDb, closeDb } from '../src/db/index.js';
import {
  getHostIdentity,
  detectHostName,
} from '../src/server/host-identity.js';

/** 预置的存量身份，hostName 是旧版落库的 mDNS 派生名 */
const LEGACY_HOST_ID = 'host-legacy-0001';
const LEGACY_DERIVED_NAME = 'zhangyufengdeMacBook-Air.local';

beforeAll(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'host-identity-test-'));
  dbPath = path.join(tempDir, 'persona.db');

  const db = getDb();
  db.query('INSERT INTO kv (key, value) VALUES (?, ?)').run(
    'host_id',
    LEGACY_HOST_ID
  );
  db.query('INSERT INTO kv (key, value) VALUES (?, ?)').run(
    'host_name',
    LEGACY_DERIVED_NAME
  );
});

afterAll(() => {
  closeDb();
  rmTempDir(tempDir);
});

describe('host identity', () => {
  /** macOS 上存量派生名自愈为友好电脑名，hostId 保持不变 */
  it.skipIf(process.platform !== 'darwin')(
    'should heal legacy mDNS derived name into friendly name',
    () => {
      const identity = getHostIdentity();
      expect(identity.hostId).toBe(LEGACY_HOST_ID);
      expect(identity.hostName).toBe(detectHostName());
      expect(identity.hostName).not.toBe(LEGACY_DERIVED_NAME);

      const row = getDb()
        .query<{ value: string }, [string]>(
          'SELECT value FROM kv WHERE key = ?'
        )
        .get('host_name');
      expect(row?.value).toBe(identity.hostName);
    }
  );

  /** 首次调用后进程内缓存复用，不再触碰库 */
  it('should return the cached identity across calls', () => {
    const first = getHostIdentity();
    expect(getHostIdentity()).toBe(first);
    expect(first.hostId.length).toBeGreaterThan(0);
    expect(first.hostName.length).toBeGreaterThan(0);
  });

  /** 自称名解析总有非空结果，macOS 上不应再产出派生名 */
  it('should resolve a non-empty friendly host name', () => {
    const name = detectHostName();
    expect(name.length).toBeGreaterThan(0);
    if (process.platform === 'darwin') {
      expect(name.endsWith('.local')).toBe(false);
    }
  });
});
