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

/**
 * Mapping of provider IDs to their official docs portal.
 * Values are copied from the provider-level doc field on models.dev.
 * kimi-coding and openai-codex have no upstream entry of their own and
 * fall back to the parent brand portal.
 */
const PROVIDER_DOCS: Record<string, string> = {
  anthropic: 'https://docs.anthropic.com/en/docs/about-claude/models',
  google: 'https://ai.google.dev/gemini-api/docs/models',
  openai: 'https://platform.openai.com/docs/models',
  xai: 'https://docs.x.ai/docs/models',
  openrouter: 'https://openrouter.ai/models',
  zai: 'https://docs.z.ai/guides/overview/pricing',
  minimax: 'https://platform.minimax.io/docs/guides/quickstart',
  'minimax-cn': 'https://platform.minimaxi.com/docs/guides/quickstart',
  'opencode-go': 'https://opencode.ai/docs/zen',
  'kimi-coding': 'https://platform.moonshot.cn/docs/api/chat',
  deepseek: 'https://api-docs.deepseek.com/quick_start/pricing',
  huggingface: 'https://huggingface.co/docs/inference-providers',
  'openai-codex': 'https://platform.openai.com/docs/models',
  xiaomi: 'https://platform.xiaomimimo.com/#/docs',
  moonshotai: 'https://platform.moonshot.ai/docs/api/chat',
  'moonshotai-cn': 'https://platform.moonshot.cn/docs/api/chat',
  'xiaomi-token-plan-cn': 'https://platform.xiaomimimo.com/#/docs',
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

/**
 * Collator for model names of one provider.
 * Numeric collation keeps 5.10 after 5.9, and the locale is pinned so every
 * runtime sorts the same catalog the same way.
 */
const modelNameCollator = new Intl.Collator('en', {
  numeric: true,
  sensitivity: 'base',
});

/**
 * Read the generation a model belongs to.
 * The catalog carries no release date, so the leading number of the model id
 * stands in for the generation.
 * @param modelId - Model id from the catalog
 * @returns The leading number, 0 when the id has no number
 */
function generationOf(modelId: string): number {
  return Number(modelId.match(/\d+/)?.[0] ?? 0);
}

/**
 * Compare two model ids from newest to oldest.
 * A model of a newer generation sorts first, and models of the same generation
 * are ordered by name in descending natural order.
 * @param a - First model id
 * @param b - Second model id
 * @returns Negative when a is newer than b
 */
function compareModelsNewestFirst(a: string, b: string): number {
  return generationOf(b) - generationOf(a) || modelNameCollator.compare(b, a);
}

/**
 * Order the whitelisted providers for the provider list.
 * Providers with a stored key come first in the order their entries appear in
 * the key file, which is the order the user configured them, and the remaining
 * providers follow in whitelist order.
 * @param store - Key store read from disk
 * @returns Provider ids in list order
 */
function orderProviderIds(store: AuthStore): KnownProvider[] {
  const configured = Object.keys(store).filter((id) =>
    SUPPORTED_PROVIDERS.includes(id as KnownProvider)
  ) as KnownProvider[];
  const unconfigured = SUPPORTED_PROVIDERS.filter((p) => !store[p]);
  return [...configured, ...unconfigured];
}

/**
 * List all providers with their auth status and available models.
 * Providers with a key come first in configuration order, the models of each
 * provider run from newest to oldest, and every model carries its context window.
 */
export function listProvidersWithAuth(): ProviderStatus[] {
  const store = readAuthStore();
  return orderProviderIds(store).map((p) => {
    const providerModels = models.getModels(p);
    const hasAuthFlag = !!store[p];
    return {
      id: p,
      name: PROVIDER_NAMES[p] || p,
      models: providerModels.map((m) => m.id).sort(compareModelsNewestFirst),
      hasAuth: hasAuthFlag,
      docUrl: PROVIDER_DOCS[p] ?? '',
      visionModelIds: providerModels
        .filter((m) => m.input.includes('image'))
        .map((m) => m.id),
      contextWindows: Object.fromEntries(
        providerModels.map((m) => [m.id, m.contextWindow])
      ),
    };
  });
}

/** Check if a provider has auth info configured */
export function hasAuth(provider: Provider): boolean {
  return !!readAuthStore()[provider];
}
