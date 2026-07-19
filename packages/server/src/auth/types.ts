/**
 * @fileoverview Type definitions for auth management.
 */

import type { KnownProvider, ProviderId } from '@earendil-works/pi-ai';

export type { KnownProvider };

/**
 * Provider identifier string.
 *
 * pi-ai 0.80 split the old `Provider` string type into `ProviderId` (string)
 * and `Provider` (runtime interface). This project only deals with provider
 * identifiers, so we re-export under the original name to keep call-sites stable.
 */
export type Provider = ProviderId;

/** Api key for an LLM provider */
export interface Auth {
  apiKey: string;
}

/** Auth storage structure, maps provider identifiers to auth info */
export type AuthStore = Record<ProviderId, Auth>;
