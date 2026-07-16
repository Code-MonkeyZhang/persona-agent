import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ARCH_MAP = { 1: 'x64', 3: 'arm64' };

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const archName = ARCH_MAP[context.arch];
  if (!archName) {
    console.warn(`[afterPack] Unknown arch: ${context.arch}, skipping`);
    return;
  }

  const projectRoot = resolve(import.meta.dirname, '..', '..', '..');
  const serverDist = join(projectRoot, 'packages', 'server', 'dist');
  const serverBin = join(projectRoot, 'packages', 'server', 'bin');
  const resourcesBin = join(context.appOutDir, 'Contents', 'Resources', 'bin');

  mkdirSync(resourcesBin, { recursive: true });

  const serverSrc = join(serverDist, `persona-agent-server-darwin-${archName}`);
  const cloudflaredSrc = join(serverBin, `cloudflared-darwin-${archName}`);

  if (existsSync(serverSrc)) {
    copyFileSync(serverSrc, join(resourcesBin, 'persona-agent-server'));
    console.log(`[afterPack] Replaced server binary with darwin-${archName}`);
  } else {
    console.warn(`[afterPack] Server binary not found: ${serverSrc}`);
  }

  if (existsSync(cloudflaredSrc)) {
    copyFileSync(cloudflaredSrc, join(resourcesBin, 'cloudflared'));
    console.log(`[afterPack] Replaced cloudflared binary with darwin-${archName}`);
  } else {
    console.warn(`[afterPack] Cloudflared binary not found: ${cloudflaredSrc}`);
  }
}
