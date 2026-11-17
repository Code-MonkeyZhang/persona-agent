import type { ModelConfig } from './model-config.js';
import type { Message } from './schema.js';
import type { AgentConfig } from './agent.js';
import type { LauncherSnapshot } from './launcher.js';

/** Session metadata (first line of the JSONL file) */
export interface SessionMeta {
  id: string;
  agentId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  workspacePath?: string;
  /**
   * 会话当前模型。
   *
   * 创建时留空,首次发送时由 Agent 默认模型固化;
   * undefined 表示尚未发过消息且用户未显式选择过模型,
   * 读取方应回落到 Agent 的 defaultModel。
   */
  model?: ModelConfig;
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
   * 会话未读标记。
   *
   * server 权威字段，round_complete 落盘后无条件置 true，客户端 viewed
   * 上报置 false，任何一端看过即全局看过。undefined 与 false 等价，
   * 服务端列默认 0。read_state 表的按设备游标属储存层预留，与本字段脱钩。
   */
  hasUnread?: boolean;

  /**
   * 最后一条真实消息的预览文本。
   *
   * 列表接口派生字段，由 listSessionFiles 从已读入的消息行现算，不落盘。
   * 仅对常驻聊天会话计算；undefined 表示无消息或非聊天会话。
   */
  lastMessage?: string;

  /**
   * 会话占用底数。
   *
   * 最近一次对账通过的真实报数落在此处，随 meta 变更流同步到各端。
   * undefined 表示该会话尚未收到过报数。
   */
  usageState?: UsageState;

  /**
   * 压缩记录清单，一次压缩一条，时间线压缩行的唯一数据源。
   * 条数上限五十，超出丢最老；当前摘要只存最新一条 complete 记录。
   */
  compressionLog?: CompressionRecord[];
}

/** 分段估算，三段 token 数，真实报数定总量，估算定构成 */
export interface BreakdownShares {
  messages: number;
  systemPersona: number;
  toolsSkills: number;
}

/**
 * 会话占用底数，base 为 null 表示该模型不报真实数字。
 *
 * - base 是最近一次对账通过的报数，口径为 input 加 cacheRead 加 cacheWrite
 * - anchorSeq 是报数请求时刻的会话消息数，之后的持久消息按估算计入分子
 * - netAdjust 是压缩净调整，压缩落地时叠加，新报数落账时清零
 * - shares 是报数请求的拼装快照，供占用面板分段展示
 * - assemblyTokens 是随底数一并记录的装配估算量，分子先减报数时装配再加现行装配
 */
export interface UsageState {
  base: number | null;
  anchorSeq: number;
  netAdjust: number;
  shares: BreakdownShares | null;
  /**
   * 报数时的装配估算量，即当次 shares 的 systemPersona 加 toolsSkills 合计。
   * undefined 表示旧底数未记录装配，分子不参与装配修正，下一次报数自动升级。
   */
  assemblyTokens?: number;
}

/** 占用快照，context_usage 事件的载荷，分子分母任缺时不产生 */
export interface UsageSnapshot {
  used: number;
  window: number;
  shares: BreakdownShares | null;
}

/**
 * 压缩记录，随 SessionMeta 持久化，时间线压缩行的唯一数据源。
 *
 * - attempt 是最新一次尝试的序号，从一次起算，重试递增
 * - before 与 after 是分子快照，数字缺失时为 null
 * - summary 仅最新一条 complete 记录携带，任何压缩行展开看到的都是它
 */
/** 压缩失败原因码，no_material 是真底线，interrupted 只来自服务端崩溃恢复的 meta */
export type CompressionFailReason =
  | 'no_material'
  | 'provider'
  | 'bad_summary'
  | 'interrupted';

export interface CompressionRecord {
  id: string;
  state: 'running' | 'complete' | 'failed' | 'interrupted';
  trigger: 'auto' | 'manual';
  attempt: number;
  before: number | null;
  after: number | null;
  reason?: CompressionFailReason;
  summary?: string;
  at: number;
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
   * 压缩摘要清单，每批压缩 append 一条，落 sessions 表。
   * 加载历史时逐条以带信封前缀的 user 消息插在未摘要区之前，
   * 早期对话的大意由此保留。undefined 表示从未压缩。
   */
  compressionSummaries?: string[];
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
  /** 小手机偏好节，行未写入时缺席，老服务端快照也没有此字段 */
  launcher?: LauncherSnapshot;
}
