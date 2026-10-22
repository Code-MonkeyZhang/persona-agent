/**
 * @fileoverview Agent App 清账记录测试
 * 覆盖记录与除名的读写回路、回收跳过已死编号、
 * 回收杀掉命令行匹配的活进程、身份对不上时只除名不杀。
 */
import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

/** 临时 mcp 目录，清账记录落在里面 */
let mcpDir: string;

mock.module('../src/util/paths.js', () => ({
  getMcpDir: () => mcpDir,
}));

mock.module('../src/util/logger.js', () => ({
  Logger: {
    log: () => {},
  },
}));

import {
  recordAppPid,
  removeAppPids,
  readAppPidEntries,
  sweepStaleAppPids,
} from '../src/mcp/app-pid-ledger.js';

describe('app-pid-ledger', () => {
  beforeAll(() => {
    mcpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'app-pid-test-'));
  });

  afterAll(() => {
    fs.rmSync(mcpDir, { recursive: true, force: true });
  });

  it('records then removes entries by name', () => {
    recordAppPid('pomodoro-timer', 111, {
      command: 'uv',
      args: ['run', '--directory', '/srv/pomodoro'],
    });
    recordAppPid('health-manager', 222, { command: 'uv', cwd: '/srv/health' });

    expect(readAppPidEntries().map((e) => e.name).sort()).toEqual([
      'health-manager',
      'pomodoro-timer',
    ]);

    removeAppPids(['pomodoro-timer']);
    expect(readAppPidEntries().map((e) => e.name)).toEqual(['health-manager']);
  });

  it('drops dead pid records without killing anything', async () => {
    recordAppPid('gone', 4194304, { command: 'uv', cwd: '/srv/gone' });

    await sweepStaleAppPids();

    expect(readAppPidEntries()).toEqual([]);
  });

  it('reaps a live process whose command line matches the recorded dir', async () => {
    const proc = Bun.spawn(['/bin/sleep', '60']);
    recordAppPid('sleeper', proc.pid, { command: 'uv', cwd: '/bin/sleep' });

    await sweepStaleAppPids();

    expect(readAppPidEntries()).toEqual([]);
    const code = await Promise.race([
      proc.exited,
      new Promise((_, reject) => setTimeout(() => reject(new Error('still alive')), 3000)),
    ]);
    expect(code).toBeDefined();
  });

  it('skips a live process whose identity does not match', async () => {
    const proc = Bun.spawn(['/bin/sleep', '60']);
    recordAppPid('stranger', proc.pid, {
      command: 'uv',
      cwd: '/definitely/not/ours',
    });

    await sweepStaleAppPids();

    expect(readAppPidEntries()).toEqual([]);
    expect(proc.exitCode === null && proc.signalCode === null).toBe(true);
    proc.kill();
    await proc.exited;
  });
});
