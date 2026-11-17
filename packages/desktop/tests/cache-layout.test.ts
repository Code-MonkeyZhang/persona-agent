/**
 * @fileoverview 设备缓存目录布局测试：路径构造、旧布局迁移与伪目录归拢的幂等收敛。
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  attachmentsDirFor,
  deviceCacheDir,
  mirrorPathFor,
  migrateLegacyMirrors,
  migrateLegacyPartitions,
  foldPseudoLocalDir,
} from '../src/main/cache/cache-layout';

/** 本机服务器主机号的测试取值 */
const SERVER = '02569d60';

/** 远程主机号的测试取值 */
const REMOTE = 'c960d4e9-remote';

/** 临时数据根 */
let dataDir: string;

/** 迁移日志的收集器 */
let logs: string[];

beforeEach(() => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cache-layout-test-'));
  logs = [];
});

afterEach(() => {
  fs.rmSync(dataDir, { recursive: true, force: true });
});

describe('path builders', () => {
  it('places mirror and attachments inside the per-device directory', () => {
    expect(deviceCacheDir(dataDir, REMOTE)).toBe(
      path.join(dataDir, 'cache', REMOTE)
    );
    expect(mirrorPathFor(dataDir, REMOTE)).toBe(
      path.join(dataDir, 'cache', REMOTE, 'mirror.db')
    );
    expect(attachmentsDirFor(dataDir, SERVER)).toBe(
      path.join(dataDir, 'cache', SERVER, 'attachments')
    );
  });
});

describe('migrateLegacyMirrors', () => {
  it('maps the legacy local-named family into the local server directory', () => {
    fs.writeFileSync(path.join(dataDir, 'cache-local.db'), 'main');
    fs.writeFileSync(path.join(dataDir, 'cache-local.db-wal'), 'wal');

    migrateLegacyMirrors(dataDir, SERVER, (m) => logs.push(m));

    const target = mirrorPathFor(dataDir, SERVER);
    expect(fs.readFileSync(target, 'utf-8')).toBe('main');
    expect(fs.readFileSync(`${target}-wal`, 'utf-8')).toBe('wal');
    expect(fs.existsSync(path.join(dataDir, 'cache-local.db'))).toBe(false);
  });

  it('moves each legacy remote mirror into its own device directory', () => {
    fs.writeFileSync(path.join(dataDir, `cache-${REMOTE}.db`), 'remote');

    migrateLegacyMirrors(dataDir, SERVER, (m) => logs.push(m));

    expect(fs.readFileSync(mirrorPathFor(dataDir, REMOTE), 'utf-8')).toBe(
      'remote'
    );
    expect(logs.some((m) => m.includes('migrated'))).toBe(true);
  });

  it('adopts the single legacy mirror only when the target is absent', () => {
    fs.writeFileSync(path.join(dataDir, 'desktop-cache.db'), 'single');

    migrateLegacyMirrors(dataDir, SERVER, (m) => logs.push(m));

    expect(fs.readFileSync(mirrorPathFor(dataDir, SERVER), 'utf-8')).toBe(
      'single'
    );
  });

  it('deletes the single legacy mirror as an orphan when the target exists', () => {
    fs.mkdirSync(path.dirname(mirrorPathFor(dataDir, SERVER)), {
      recursive: true,
    });
    fs.writeFileSync(mirrorPathFor(dataDir, SERVER), 'current');
    fs.writeFileSync(path.join(dataDir, 'desktop-cache.db'), 'orphan');
    fs.writeFileSync(path.join(dataDir, 'desktop-cache.db-wal'), 'orphan-wal');

    migrateLegacyMirrors(dataDir, SERVER, (m) => logs.push(m));

    expect(fs.readFileSync(mirrorPathFor(dataDir, SERVER), 'utf-8')).toBe(
      'current'
    );
    expect(fs.existsSync(path.join(dataDir, 'desktop-cache.db'))).toBe(false);
    expect(fs.existsSync(path.join(dataDir, 'desktop-cache.db-wal'))).toBe(
      false
    );
    expect(logs.some((m) => m.includes('orphan'))).toBe(true);
  });

  it('is idempotent on rerun after a completed migration', () => {
    fs.writeFileSync(path.join(dataDir, 'cache-local.db'), 'main');

    migrateLegacyMirrors(dataDir, SERVER, () => undefined);
    migrateLegacyMirrors(dataDir, SERVER, (m) => logs.push(m));

    expect(fs.readFileSync(mirrorPathFor(dataDir, SERVER), 'utf-8')).toBe(
      'main'
    );
    expect(logs).toHaveLength(0);
  });

  it('does nothing when the data directory is missing', () => {
    expect(() =>
      migrateLegacyMirrors(
        path.join(dataDir, 'missing'),
        SERVER,
        () => undefined
      )
    ).not.toThrow();
  });
});

describe('migrateLegacyPartitions', () => {
  /** 旧图片分区根 */
  let legacyRoot: string;

  beforeEach(() => {
    legacyRoot = path.join(dataDir, 'image-cache');
  });

  it('moves each partition into the directory of the same name', () => {
    fs.mkdirSync(path.join(legacyRoot, SERVER), { recursive: true });
    fs.mkdirSync(path.join(legacyRoot, REMOTE), { recursive: true });
    fs.writeFileSync(path.join(legacyRoot, SERVER, 'a'.repeat(64)), 'a');
    fs.writeFileSync(path.join(legacyRoot, REMOTE, 'b'.repeat(64)), 'b');

    migrateLegacyPartitions(dataDir, (m) => logs.push(m));

    expect(
      fs.existsSync(path.join(attachmentsDirFor(dataDir, SERVER), 'a'.repeat(64)))
    ).toBe(true);
    expect(
      fs.existsSync(
        path.join(attachmentsDirFor(dataDir, REMOTE), 'b'.repeat(64))
      )
    ).toBe(true);
    expect(fs.existsSync(legacyRoot)).toBe(false);
  });

  it('deletes unattributable flat entries and junk', () => {
    fs.mkdirSync(legacyRoot, { recursive: true });
    fs.writeFileSync(path.join(legacyRoot, 'c'.repeat(64)), 'c');
    fs.writeFileSync(path.join(legacyRoot, '.DS_Store'), 'junk');

    migrateLegacyPartitions(dataDir, () => undefined);

    expect(fs.existsSync(legacyRoot)).toBe(false);
  });

  it('merges into an existing target and drops leftover source files', () => {
    fs.mkdirSync(path.join(legacyRoot, REMOTE), { recursive: true });
    fs.mkdirSync(attachmentsDirFor(dataDir, REMOTE), { recursive: true });
    fs.writeFileSync(path.join(legacyRoot, REMOTE, 'd'.repeat(64)), 'd');

    migrateLegacyPartitions(dataDir, () => undefined);

    expect(
      fs.existsSync(
        path.join(attachmentsDirFor(dataDir, REMOTE), 'd'.repeat(64))
      )
    ).toBe(true);
    expect(fs.existsSync(path.join(legacyRoot, REMOTE))).toBe(false);
  });

  it('returns quietly when the legacy root does not exist', () => {
    expect(() =>
      migrateLegacyPartitions(dataDir, () => undefined)
    ).not.toThrow();
  });
});

describe('foldPseudoLocalDir', () => {
  it('renames the whole pseudo directory when the target is absent', () => {
    const pseudo = deviceCacheDir(dataDir, 'local');
    fs.mkdirSync(path.join(pseudo, 'attachments'), { recursive: true });
    fs.writeFileSync(mirrorPathFor(dataDir, 'local'), 'mirror');
    fs.writeFileSync(
      path.join(pseudo, 'attachments', 'a'.repeat(64)),
      'a'
    );

    foldPseudoLocalDir(dataDir, SERVER, (m) => logs.push(m));

    expect(fs.readFileSync(mirrorPathFor(dataDir, SERVER), 'utf-8')).toBe(
      'mirror'
    );
    expect(
      fs.existsSync(
        path.join(attachmentsDirFor(dataDir, SERVER), 'a'.repeat(64))
      )
    ).toBe(true);
    expect(fs.existsSync(pseudo)).toBe(false);
    expect(logs.some((m) => m.includes('folded'))).toBe(true);
  });

  it('merges into an existing target and keeps the target on name clashes', () => {
    const pseudo = deviceCacheDir(dataDir, 'local');
    fs.mkdirSync(path.join(pseudo, 'attachments'), { recursive: true });
    fs.writeFileSync(path.join(pseudo, 'attachments', 'a'.repeat(64)), 'old');
    fs.writeFileSync(path.join(pseudo, 'attachments', 'b'.repeat(64)), 'new');
    fs.writeFileSync(mirrorPathFor(dataDir, 'local'), 'mirror');
    fs.mkdirSync(attachmentsDirFor(dataDir, SERVER), { recursive: true });
    fs.writeFileSync(
      path.join(attachmentsDirFor(dataDir, SERVER), 'a'.repeat(64)),
      'kept'
    );

    foldPseudoLocalDir(dataDir, SERVER, () => undefined);

    expect(
      fs.readFileSync(
        path.join(attachmentsDirFor(dataDir, SERVER), 'a'.repeat(64)),
        'utf-8'
      )
    ).toBe('kept');
    expect(
      fs.existsSync(
        path.join(attachmentsDirFor(dataDir, SERVER), 'b'.repeat(64))
      )
    ).toBe(true);
    expect(fs.existsSync(mirrorPathFor(dataDir, SERVER))).toBe(true);
    expect(fs.existsSync(pseudo)).toBe(false);
  });

  it('returns quietly when no pseudo directory exists', () => {
    expect(() =>
      foldPseudoLocalDir(dataDir, SERVER, () => undefined)
    ).not.toThrow();
    expect(logs).toHaveLength(0);
  });
});
