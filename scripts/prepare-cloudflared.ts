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

interface ParsedArgs {
  version: string;
  macAll: boolean;
}

function parseArgs(): ParsedArgs {
  const args = process.argv.slice(2);
  let version = DEFAULT_VERSION;
  let macAll = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--version' && args[i + 1]) {
      version = args[i + 1];
    }
    if (args[i] === '--mac-all') {
      macAll = true;
    }
  }
  return { version, macAll };
}

interface CloudflaredInfo {
  filename: string;
  isTgz: boolean;
}

function getCloudflaredInfo(platform: string, arch: string): CloudflaredInfo {
  if (platform === 'darwin' && arch === 'arm64') {
    return { filename: 'cloudflared-darwin-arm64.tgz', isTgz: true };
  }
  if (platform === 'darwin' && arch === 'x64') {
    return { filename: 'cloudflared-darwin-amd64.tgz', isTgz: true };
  }
  if (platform === 'win32' && arch === 'x64') {
    return { filename: 'cloudflared-windows-amd64.exe', isTgz: false };
  }
  if (platform === 'linux' && arch === 'x64') {
    return { filename: 'cloudflared-linux-amd64', isTgz: false };
  }
  if (platform === 'linux' && arch === 'arm64') {
    return { filename: 'cloudflared-linux-arm64', isTgz: false };
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

async function installCloudflared(
  version: string,
  platform: string,
  arch: string,
  binDir: string,
  outName: string,
): Promise<string> {
  const { filename, isTgz } = getCloudflaredInfo(platform, arch);
  const outPath = resolve(binDir, outName);
  const url = `https://github.com/cloudflare/cloudflared/releases/download/${version}/${filename}`;
  console.log(`Downloading cloudflared v${version} for ${platform}-${arch}...`);
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

  if (platform !== 'win32') {
    chmodSync(outPath, 0o755);
  }

  console.log(`cloudflared v${version} installed to ${outPath}`);
  return outPath;
}

async function main(): Promise<void> {
  const { version, macAll } = parseArgs();

  const rootDir = resolve(import.meta.dirname, '..');
  const binDir = resolve(rootDir, 'packages', 'server', 'bin');
  mkdirSync(binDir, { recursive: true });

  const platform = process.platform;
  const arch = process.arch;

  if (macAll && platform === 'darwin') {
    await installCloudflared(version, 'darwin', 'arm64', binDir, 'cloudflared-darwin-arm64');
    await installCloudflared(version, 'darwin', 'x64', binDir, 'cloudflared-darwin-x64');
    await installCloudflared(version, 'darwin', arch, binDir, 'cloudflared');
  } else {
    const outName = platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
    await installCloudflared(version, platform, arch, binDir, outName);
  }
}

main().catch((err) => {
  console.error('Failed to prepare cloudflared:', err);
  process.exit(1);
});
