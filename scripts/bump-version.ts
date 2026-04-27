import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const semverRegex = /^\d+\.\d+\.\d+$/;

const version = process.argv[2];
if (!version || !semverRegex.test(version)) {
  console.error(
    'Usage: bun run scripts/bump-version.ts <version>\nExample: bun run scripts/bump-version.ts 1.0.1',
  );
  process.exit(1);
}

const files = [
  'package.json',
  'packages/server/package.json',
  'packages/desktop/package.json',
];

const rootDir = resolve(import.meta.dirname, '..');

for (const file of files) {
  const filePath = resolve(rootDir, file);
  const content = readFileSync(filePath, 'utf-8');
  const json = JSON.parse(content);

  const oldVersion = json.version;
  json.version = version;

  writeFileSync(filePath, JSON.stringify(json, null, 2) + '\n');
  console.log(`${file}: ${oldVersion} → ${version}`);
}

console.log(`\nDone. All three package.json updated to v${version}.`);
