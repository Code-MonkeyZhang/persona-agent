/**
 * @fileoverview SQLite 建库 DDL 与版本常量。
 *
 * 首批表覆盖 V3 规划中要落库的结构化数据。messages_fts 随搜索功能
 * 分支建，记忆相关表随记忆重构设计，都不在本文件范围。
 *
 * 与设计文档的一处偏差：sessions.model 允许 NULL。updateModel 接受
 * undefined，落库为 NULL，读回还原为 undefined。
 */

/** 当前 schema 版本，写进 PRAGMA user_version，只前进不回退。 */
export const SCHEMA_VERSION = 2;

/** 首次建库执行的建表语句，全部 IF NOT EXISTS，重复执行幂等。 */
export const CREATE_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_hash TEXT,
  workspace_path TEXT,
  config TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  title TEXT NOT NULL,
  workspace_path TEXT,
  model TEXT,
  summarized_up_to INTEGER,
  current_pose TEXT,
  turn_ends TEXT,
  last_message_preview TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_agent_updated
  ON sessions (agent_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS messages (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  data TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_session
  ON messages (session_id, seq);

CREATE TABLE IF NOT EXISTS changes (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  session_id TEXT,
  data TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS attachments (
  hash TEXT PRIMARY KEY,
  format TEXT NOT NULL,
  size INTEGER NOT NULL,
  width INTEGER,
  height INTEGER,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  paired_at INTEGER NOT NULL,
  last_online INTEGER
);

CREATE TABLE IF NOT EXISTS read_state (
  device_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  read_seq INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (device_id, session_id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  schedule TEXT NOT NULL,
  next_run_at INTEGER,
  status TEXT NOT NULL,
  output_session_id TEXT
);

CREATE TABLE IF NOT EXISTS apps (
  app_id TEXT PRIMARY KEY,
  version TEXT NOT NULL,
  install_path TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  layout TEXT
);
`;
