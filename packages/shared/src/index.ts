/**
 * @persona/shared — desktop 与 server 共享的领域模型、协议契约与常量。
 *
 * 本包只包含纯类型定义与简单常量，不依赖任何运行时（Node / Bun / 浏览器）专属 API。
 * 由 desktop（vite）与 server（bun build）在各自构建时直接编译引用，无预编译步骤。
 *
 * 后续按阶段迁入：WS 协议 → 领域模型 → Provider/MCP/Skill/TTS 契约。
 */

export { ModelConfigSchema, type ModelConfig } from './model-config.js';
export {
  AgentConfigSchema,
  AgentConfigInputSchema,
  AgentConfigUpdateSchema,
  type AgentConfig,
  type AgentConfigInput,
  type AgentConfigUpdate,
} from './agent.js';
export type {
  ContentBlock,
  SystemMessage,
  UserMessage,
  ToolCall,
  AssistantMessage,
  Message,
} from './schema.js';
export type { SessionMeta, Session } from './session.js';
export * from './ws.js';
export type { ProviderStatus } from './provider.js';
export type { McpServerStatus, McpServerInfo, McpOAuthStatus } from './mcp.js';
export type { SkillInfo } from './skill.js';
export type { TtsModel, ClonedVoice, VoiceOption, TtsConfig } from './tts.js';
export {
  MarketplaceEntrySchema,
  type MarketplaceEntry,
} from './marketplace.js';
