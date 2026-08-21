/**
 * @fileoverview API key storage module for managing LLM provider credentials.
 * Credentials are stored in ~/.local/share/persona-agent/config/auth.json, shared globally.
 */

import * as fs from 'node:fs';
import { getAuthPath } from '../util/paths.js';
import { readJsonFile } from '../util/fs-helpers.js';
import { models } from '../agent/pi-models.js';
import type { Auth, AuthStore, Provider, KnownProvider } from './types.js';
import type { ProviderStatus } from '@persona/shared';

// 线上形状已迁移至 @persona/shared
export type { ProviderStatus };

/**
 * Supported providers whitelist.
 * Only simple API key auth providers are included.
 * Azure, AWS Bedrock, Google Vertex and other OAuth-based providers are excluded.
 */
const SUPPORTED_PROVIDERS: KnownProvider[] = [
  'anthropic',
  'google',
  'openai',
  'xai',
  'openrouter',
  'zai',
  'minimax',
  'minimax-cn',
  'opencode-go',
  'kimi-coding',
  'deepseek',
  'huggingface',
  'openai-codex',
  'xiaomi',
  'moonshotai',
  'moonshotai-cn',
  'xiaomi-token-plan-cn',
];

/** Mapping of provider IDs to display names */
const PROVIDER_NAMES: Record<string, string> = {
  anthropic: 'Anthropic',
  google: 'Google',
  openai: 'OpenAI',
  xai: 'xAI',
  openrouter: 'OpenRouter',
  zai: 'Z.AI',
  minimax: 'MiniMax',
  'minimax-cn': 'MiniMax-CN',
  'opencode-go': 'OpenCode Go',
  'kimi-coding': 'Kimi Coding',
  deepseek: 'DeepSeek',
  huggingface: 'HuggingFace',
  'openai-codex': 'OpenAI Codex',
  xiaomi: 'Xiaomi',
  moonshotai: 'Moonshot AI',
  'moonshotai-cn': 'Moonshot AI CN',
  'xiaomi-token-plan-cn': 'Xiaomi Token Plan CN',
};

/** Read auth store from file */
function readAuthStore(): AuthStore {
  return readJsonFile<AuthStore>(getAuthPath(), {});
}

/** Write auth store to file */
function writeAuthStore(store: AuthStore): void {
  fs.writeFileSync(getAuthPath(), JSON.stringify(store, null, 2));
}

/**
 * Set or update auth info for a provider, immediately persists to disk.
 * @param provider - Provider identifier
 * @param auth - Auth object containing apiKey
 */
export function setAuth(provider: Provider, auth: Auth): Auth {
  const store = readAuthStore();
  store[provider] = auth;
  writeAuthStore(store);
  return auth;
}

/**
 * Delete auth info for a provider.
 * @throws Error if auth info doesn't exist
 */
export function deleteAuth(provider: Provider): void {
  const store = readAuthStore();
  if (!store[provider]) {
    throw new Error(`Auth not found for provider: ${provider}`);
  }
  delete store[provider];
  writeAuthStore(store);
}

/** Get auth info for a provider, returns undefined if not found */
export function getAuth(provider: Provider): Auth | undefined {
  return readAuthStore()[provider];
}

/** List all providers with their auth status and available models */
export function listProvidersWithAuth(): ProviderStatus[] {
  const store = readAuthStore();
  return SUPPORTED_PROVIDERS.map((p) => {
    const providerModels = models.getModels(p);
    const hasAuthFlag = !!store[p];
    return {
      id: p,
      name: PROVIDER_NAMES[p] || p,
      models: providerModels.map((m) => m.id),
      hasAuth: hasAuthFlag,
    };
  });
}

/** Check if a provider has auth info configured */
export function hasAuth(provider: Provider): boolean {
  return !!readAuthStore()[provider];
}
