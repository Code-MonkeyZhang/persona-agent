import * as fs from 'node:fs';
import * as path from 'node:path';
import { Logger } from '../../util/logger.js';
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js';
import type { OAuthStorageEntry } from './types.js';

/**
 * In-memory cache keyed by server name.
 * Entries are loaded from file on first access and kept in sync on writes.
 * A `null` value indicates the entry has been deleted.
 */
const cache = new Map<string, OAuthStorageEntry | null>();

/** Read the entire OAuth tokens file from disk. Returns empty object if missing. */
function loadAll(filePath: string): Record<string, OAuthStorageEntry> {
  if (!fs.existsSync(filePath)) {
    return {};
  }
  const content = fs.readFileSync(filePath, 'utf8');
  if (!content.trim()) {
    return {};
  }
  return JSON.parse(content) as Record<string, OAuthStorageEntry>;
}

/** Write the entire data map to disk, creating parent directories if needed. */
function saveAll(
  filePath: string,
  data: Record<string, OAuthStorageEntry>
): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

/**
 * Get a single server's OAuth entry.
 * Returns from cache if available, otherwise reads from file.
 * Returns an empty object (all fields undefined) for non-existent entries.
 */
function getEntry(filePath: string, name: string): OAuthStorageEntry {
  const cached = cache.get(name);
  if (cached !== undefined) {
    return cached ?? {};
  }
  const all = loadAll(filePath);
  const entry = all[name] ?? {};
  cache.set(name, Object.keys(entry).length > 0 ? entry : null);
  return entry;
}

/** Update a server's entry in both cache and file. */
function setEntry(
  filePath: string,
  name: string,
  entry: OAuthStorageEntry
): void {
  cache.set(name, entry);
  const all = loadAll(filePath);
  all[name] = entry;
  saveAll(filePath, all);
}

export function loadTokens(
  filePath: string,
  name: string
): OAuthTokens | undefined {
  return getEntry(filePath, name).tokens;
}

export function saveTokens(
  filePath: string,
  name: string,
  tokens: OAuthTokens
): void {
  const entry = getEntry(filePath, name);
  setEntry(filePath, name, { ...entry, tokens });
  Logger.log('MCP-OAuth', `Saved OAuth tokens for '${name}'`);
}

export function loadClientInfo(
  filePath: string,
  name: string
): OAuthClientInformationMixed | undefined {
  return getEntry(filePath, name).clientInfo;
}

export function saveClientInfo(
  filePath: string,
  name: string,
  clientInfo: OAuthClientInformationMixed
): void {
  const entry = getEntry(filePath, name);
  setEntry(filePath, name, { ...entry, clientInfo });
  Logger.log('MCP-OAuth', `Saved OAuth client info for '${name}'`);
}

export function loadCodeVerifier(
  filePath: string,
  name: string
): string | undefined {
  return getEntry(filePath, name).codeVerifier;
}

export function saveCodeVerifier(
  filePath: string,
  name: string,
  codeVerifier: string
): void {
  const entry = getEntry(filePath, name);
  setEntry(filePath, name, { ...entry, codeVerifier });
}

/** Remove all OAuth data for a server from both cache and file. */
export function clearOAuthData(filePath: string, name: string): void {
  cache.set(name, null);
  const all = loadAll(filePath);
  delete all[name];
  saveAll(filePath, all);
  Logger.log('MCP-OAuth', `Cleared OAuth data for '${name}'`);
}
