/**
 * @fileoverview Logger 单元测试。
 * 在临时目录里用真文件验证开关、强制记录、滚动和错误的展开。
 */

import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { rmTempDir } from './temp-cleanup.js';
import { Logger } from '../src/util/logger.js';

let logDir: string;
let logFile: string;
let rotatedFile: string;

const read = (file: string): string =>
  fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';

beforeEach(() => {
  logDir = fs.mkdtempSync(path.join(os.tmpdir(), 'logger-'));
  logFile = path.join(logDir, 'agent-server.log');
  rotatedFile = path.join(logDir, 'agent-server.1.log');
});

afterEach(() => {
  Logger.setEnabled(false);
  rmTempDir(logDir);
});

describe('Logger', () => {
  it('skips normal entries while disabled but still writes critical ones', () => {
    Logger.initialize(logDir, false);

    Logger.log('TEST', 'hidden entry');
    Logger.critical('TEST', 'kept entry');

    const text = read(logFile);
    expect(text).not.toContain('hidden entry');
    expect(text).toContain('[TEST] kept entry');
  });

  it('writes normal entries while enabled', () => {
    Logger.initialize(logDir, true);

    Logger.log('TEST', 'visible entry', { answer: 42 });

    const text = read(logFile);
    expect(text).toContain('[TEST] visible entry');
    expect(text).toContain('"answer": 42');
  });

  it('appends to an existing file instead of clearing it on initialize', () => {
    fs.writeFileSync(logFile, 'earlier entry\n');
    Logger.initialize(logDir, true);

    Logger.log('TEST', 'new entry');

    const text = read(logFile);
    expect(text.startsWith('earlier entry\n')).toBe(true);
    expect(text).toContain('new entry');
    expect(fs.existsSync(rotatedFile)).toBe(false);
  });

  it('renames the full file and continues in a new one at the size cap', () => {
    Logger.initialize(logDir, true);
    const megabyte = 'x'.repeat(1024 * 1024);

    // 每条比 1MB 略大，一个文件最多放下四条，第五条写入前滚动
    for (let i = 1; i <= 6; i++) {
      Logger.log('TEST', `chunk-${i}`, megabyte);
    }
    Logger.log('TEST', 'tail entry');

    const rotated = read(rotatedFile);
    expect(rotated).toContain('chunk-1');
    expect(rotated).toContain('chunk-4');
    expect(rotated).not.toContain('chunk-5');
    const current = read(logFile);
    expect(current).toContain('chunk-5');
    expect(current).toContain('chunk-6');
    expect(current).toContain('tail entry');
    expect(current).not.toContain('chunk-4');
    expect(fs.statSync(logFile).size).toBeLessThanOrEqual(5 * 1024 * 1024);
    expect(fs.statSync(rotatedFile).size).toBeLessThanOrEqual(5 * 1024 * 1024);
  });

  it('writes the cause chain and the extra fields of an error', () => {
    Logger.initialize(logDir, true);
    const cause = Object.assign(new TypeError('socket closed'), {
      code: 'ECONNRESET',
    });

    Logger.critical(
      'TEST',
      'download broke',
      new Error('fetch failed', { cause })
    );

    const text = read(logFile);
    expect(text).toContain('message: fetch failed');
    expect(text).toContain('message: socket closed');
    expect(text).toContain('code: ECONNRESET');
  });

  it('writes the code field of a network error that has no cause', () => {
    Logger.initialize(logDir, true);
    const error = Object.assign(new TypeError('unable to connect'), {
      code: 'ConnectionRefused',
    });

    Logger.critical('TEST', 'connect failed', error);

    const text = read(logFile);
    expect(text).toContain('message: unable to connect');
    expect(text).toContain('code: ConnectionRefused');
  });
});
