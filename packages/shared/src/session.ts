import type { ModelConfig } from './model-config.js';
import type { Message } from './schema.js';

/** Session metadata (first line of the JSONL file) */
export interface SessionMeta {
  id: string;
  agentId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  workspacePath?: string;
  model: ModelConfig;
  /**
   * 原始消息已压缩到的下标（仅聊天 Session 使用）。
   *
   * 该下标之前的消息已被压缩进 `memory/history.jsonl`，但原文不删除。
   * `undefined` / `0` 表示尚未压缩，需加载全部消息。
   */
  summarizedUpTo?: number;
}

/** Full session with messages */
export interface Session extends SessionMeta {
  messages: Message[];
}
