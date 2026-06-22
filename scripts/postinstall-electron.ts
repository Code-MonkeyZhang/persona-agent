import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const ELECTRON_MIRROR = 'https://registry.npmmirror.com/-/binary/electron/';

function main(): void {
  const rootDir = resolve(import.meta.dirname, '..');
  const installScript = resolve(rootDir, 'node_modules', 'electron', 'install.js');

  if (!existsSync(installScript)) {
    console.log('[postinstall] electron not present, skipping binary download');
    return;
  }

  console.log('[postinstall] ensuring electron binary is present...');

  const result = spawnSync('node', [installScript], {
    stdio: 'inherit',
    env: { ...process.env, ELECTRON_MIRROR },
  });

  if (result.status !== 0) {
    throw new Error(`electron install.js exited with code ${result.status}`);
  }
}

main();
