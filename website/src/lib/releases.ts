import { useEffect, useState } from 'react';

const DESKTOP_REPO = 'Code-MonkeyZhang/persona-agent';
const MOBILE_REPO = 'Code-MonkeyZhang/persona-agent-mobile';

export const DESKTOP_RELEASES_URL = `https://github.com/${DESKTOP_REPO}/releases`;
export const MOBILE_RELEASES_URL = `https://github.com/${MOBILE_REPO}/releases`;
export const APP_STORE_URL = 'https://apps.apple.com/us/app/persona-agent/id6793809721';

export type DesktopAssets = {
  macArm?: string;
  macX64?: string;
  win?: string;
};

export type LatestReleases = {
  desktopVersion: string | null;
  desktopAssets: DesktopAssets;
  androidVersion: string | null;
  androidApk?: string;
};

const EMPTY: LatestReleases = {
  desktopVersion: null,
  desktopAssets: {},
  androidVersion: null,
};

const CACHE_KEY = 'pa-releases-v2';
const CACHE_TTL_MS = 60 * 60 * 1000;

type CachedReleases = LatestReleases & { fetchedAt: number };

function readCache(): CachedReleases | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedReleases;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeCache(value: LatestReleases) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ...value, fetchedAt: Date.now() }));
  } catch {
    // 持久化失败不影响本次会话的使用
  }
}

type GithubAsset = { name: string; browser_download_url: string };
type GithubRelease = { tag_name: string; assets: GithubAsset[] };

async function fetchLatest(repo: string): Promise<GithubRelease | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as GithubRelease;
  } catch {
    return null;
  }
}

function resolveDesktopAssets(assets: GithubAsset[]): DesktopAssets {
  const find = (prefix: string, ext: string) =>
    assets.find((a) => a.name.startsWith(prefix) && a.name.endsWith(ext))?.browser_download_url;
  return {
    macArm: find('Persona-mac-arm64-', '.dmg'),
    macX64: find('Persona-mac-x64-', '.dmg'),
    win: find('Persona-win-x64-', '.exe'),
  };
}

export function useLatestReleases(): LatestReleases {
  const [state, setState] = useState<LatestReleases>(() => {
    const cached = readCache();
    return cached ?? EMPTY;
  });

  useEffect(() => {
    const cached = readCache();
    if (cached) {
      const { fetchedAt: _fetchedAt, ...rest } = cached;
      setState(rest);
      return;
    }

    let cancelled = false;
    (async () => {
      const [desktop, mobile] = await Promise.all([
        fetchLatest(DESKTOP_REPO),
        fetchLatest(MOBILE_REPO),
      ]);
      if (cancelled) return;
      const next: LatestReleases = {
        desktopVersion: desktop?.tag_name ?? null,
        desktopAssets: desktop ? resolveDesktopAssets(desktop.assets) : {},
        androidVersion: mobile?.tag_name ?? null,
        androidApk: mobile?.assets.find((a) => a.name.endsWith('.apk'))?.browser_download_url,
      };
      if (next.desktopVersion || next.androidVersion) {
        writeCache(next);
        setState(next);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}

export type Platform = 'mac' | 'win' | 'ios' | 'android' | 'other';

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'other';
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'mac';
  if (/Windows/i.test(ua)) return 'win';
  return 'other';
}
