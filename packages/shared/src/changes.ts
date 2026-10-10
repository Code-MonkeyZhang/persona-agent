/**
 * @fileoverview 变更流契约 — 服务端全部历史是一条按全局递增序号排列的变化流。
 *
 * 客户端冷启动从 0 号拉全量回放，断线重连带上已有序号增量追平，
 * 联网期间靠 WebSocket 的 change 事件实时接收。
 */

/** 变更事件的种类 */
export type ChangeKind =
  | 'message_appended'
  | 'session_created'
  | 'session_updated'
  | 'session_deleted'
  | 'turn_end'
  | 'agents_invalidated';

/**
 * 单条变更事件。
 *
 * - message_appended 的 data 为 { seq, message }，携带完整消息体
 * - session_created 与 session_updated 的 data 为完整会话元信息
 * - session_deleted 的 data 为空对象，id 由 sessionId 字段承载
 * - turn_end 的 data 为 { turnEnds }，是边界的完整快照
 * - agents_invalidated 的 data 为空对象，sessionId 为 null，客户端整份重拉角色列表
 */
export interface SessionChange {
  /** 全局递增序号，客户端以此判断自己追平到哪里 */
  seq: number;
  kind: ChangeKind;
  /** 事件归属的会话 */
  sessionId: string | null;
  /** 按 kind 不同的载荷 */
  data: unknown;
  createdAt: number;
}
