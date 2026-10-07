import type { ModelConfig } from './model-config.js';
import type { Message } from './schema.js';
import type { AgentConfig } from './agent.js';

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

  /**
   * 最后一条真实消息的预览文本。
   *
   * 列表接口派生字段，由 listSessionFiles 从已读入的消息行现算，不落盘。
   * 仅对常驻聊天会话计算；undefined 表示无消息或非聊天会话。
   */
  lastMessage?: string;
}

/** Full session with messages */
export interface Session extends SessionMeta {
  messages: Message[];
  /**
   * 各 turn_end 标记行之前的消息数，loadSession 逐行解析派生，不落盘。
   * 会话接口据此把边界条目混入 messages 供渲染层结组；
   * undefined 表示文件无标记行，属旧数据。
   */
  turnEnds?: number[];
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

/** 快照里的单条消息，seq 为服务端消息行号 */
export interface SnapshotMessage {
  seq: number;
  message: Message;
  createdAt: number;
}

/** 快照里的单个会话，消息带行号与行时间戳 */
export interface SnapshotSession extends SessionMeta {
  turnEnds?: number[];
  messages: SnapshotMessage[];
}

/** 快照里的单个 Agent，正本来自配置文件，头像哈希按文件现算附加 */
export type SnapshotAgent = AgentConfig & { avatarHash: string };

/** 全量同步快照，latestSeq 为快照时刻变更流的最新序号 */
export interface SyncSnapshot {
  latestSeq: number;
  sessions: SnapshotSession[];
  agents: SnapshotAgent[];
}
