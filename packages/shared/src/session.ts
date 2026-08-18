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
   * 原始消息已压缩到的下标。
   *
   * 该下标之前的消息已被压缩进 `memory/history.jsonl`，但原文不删除。
   * `undefined` / `0` 表示尚未压缩，需加载全部消息。
   */
  summarizedUpTo?: number;

  /** 当前立绘表情名称，由 show_pose 工具写入；undefined 时前端 fallback 到 'default' */
  currentPose?: string;
}

/** Full session with messages */
export interface Session extends SessionMeta {
  messages: Message[];
  /**
   * 最后一条 context 消息的信封时间戳，loadSession 逐行解析派生，不落盘。
   * undefined 表示该会话从未注入过运行时上下文。
   */
  lastContextAt?: number;
  /**
   * 最后一条真实消息（非 context）的信封时间戳，loadSession 逐行解析派生，不落盘。
   * 用于计算"距上一条消息已过去多久"。
   */
  lastMessageAt?: number;
}
