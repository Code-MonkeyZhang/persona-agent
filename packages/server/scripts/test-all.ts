/**
 * @fileoverview Per-file test runner that executes every test file in its own
 * bun test process so mock.module registrations cannot leak across files.
 */

import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const packageDir = join(import.meta.dirname, '..');
const testsDir = join(packageDir, 'tests');

const files = readdirSync(testsDir)
  .filter((f) => f.endsWith('.test.ts') || f.endsWith('.isolated.ts'))
  .sort();

if (files.length === 0) {
  console.error('No test files found in tests/');
  process.exit(1);
}

console.log(`Running ${files.length} test files, one process per file.\n`);

let failed = 0;
for (const f of files) {
  const rel = `./${join('tests', f)}`;
  console.log(`\n=== ${rel} ===`);
  const proc = Bun.spawnSync({
    cmd: ['bun', 'test', rel],
    cwd: packageDir,
    stdout: 'inherit',
    stderr: 'inherit',
  });
  if (proc.exitCode !== 0) {
    failed++;
    console.error(`\nFAILED: ${rel}`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} of ${files.length} test files failed.`);
  process.exit(1);
}

console.log(`\nAll ${files.length} test files passed.`);
