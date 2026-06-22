/**
 * @fileoverview Type definitions for session management.
 */

export type { SessionMeta, Session } from '@persona/shared';

/** Options for creating a new session */
export interface CreateSessionOptions {
  title?: string;
}
