/**
 * @fileoverview Type definitions for session management.
 */

import type { ModelConfig } from '../agent/types.js';
import type { Message } from '../schema/index.js';

/** Session metadata (first line of the JSONL file) */
export interface SessionMeta {
  id: string;
  agentId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  workspacePath?: string;
  model: ModelConfig;
}

/** Full session with messages */
export interface Session extends SessionMeta {
  messages: Message[];
}

/** Options for creating a new session */
export interface CreateSessionOptions {
  title?: string;
}
