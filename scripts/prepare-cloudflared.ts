import {
  chmodSync,
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';

const DEFAULT_VERSION = '2025.4.0';

function parseArgs(): string {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version' && args[i + 1]) {
      return args[i + 1];
    }
  }
  return DEFAULT_VERSION;
}

function getPlatformInfo(): { filename: string; isTgz: boolean; outName: string } {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === 'darwin' && arch === 'arm64') {
    return { filename: 'cloudflared-darwin-arm64.tgz', isTgz: true, outName: 'cloudflared' };
  }
  if (platform === 'darwin' && arch === 'x64') {
    return { filename: 'cloudflared-darwin-amd64.tgz', isTgz: true, outName: 'cloudflared' };
  }
  if (platform === 'win32' && arch === 'x64') {
    return { filename: 'cloudflared-windows-amd64.exe', isTgz: false, outName: 'cloudflared.exe' };
  }
  if (platform === 'linux' && arch === 'x64') {
    return { filename: 'cloudflared-linux-amd64', isTgz: false, outName: 'cloudflared' };
  }
  if (platform === 'linux' && arch === 'arm64') {
    return { filename: 'cloudflared-linux-arm64', isTgz: false, outName: 'cloudflared' };
  }

  throw new Error(`Unsupported platform: ${platform}-${arch}`);
}

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  writeFileSync(dest, Buffer.from(arrayBuffer));
}

function extractTgz(tgzPath: string, outDir: string, outName: string): string {
  execSync(`tar xzf "${tgzPath}" -C "${outDir}"`, { stdio: 'inherit' });

  const extractedPath = resolve(outDir, 'cloudflared');
  const finalPath = resolve(outDir, outName);
  if (extractedPath !== finalPath && existsSync(extractedPath)) {
    renameSync(extractedPath, finalPath);
  }
  return finalPath;
}

async function main(): Promise<void> {
  const version = parseArgs();
  const { filename, isTgz, outName } = getPlatformInfo();

  const rootDir = resolve(import.meta.dirname, '..');
  const binDir = resolve(rootDir, 'packages', 'server', 'bin');
  const outPath = resolve(binDir, outName);

  mkdirSync(binDir, { recursive: true });

  const url = `https://github.com/cloudflare/cloudflared/releases/download/${version}/${filename}`;
  console.log(`Downloading cloudflared v${version} for ${process.platform}-${process.arch}...`);
  console.log(`URL: ${url}`);

  if (isTgz) {
    const tgzPath = resolve(binDir, filename);
    await downloadFile(url, tgzPath);
    console.log('Extracting...');
    extractTgz(tgzPath, binDir, outName);
    unlinkSync(tgzPath);
  } else {
    await downloadFile(url, outPath);
  }

  if (process.platform !== 'win32') {
    chmodSync(outPath, 0o755);
  }

  console.log(`cloudflared v${version} installed to ${outPath}`);
}

main().catch((err) => {
  console.error('Failed to prepare cloudflared:', err);
  process.exit(1);
});
