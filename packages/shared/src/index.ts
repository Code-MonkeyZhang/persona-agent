/**
 * @persona/shared — desktop 与 server 共享的领域模型、协议契约与常量。
 *
 * 本包只包含纯类型定义与简单常量，不依赖任何运行时专属 API。
 * 由 desktop 与 server 在各自构建时直接编译引用，无预编译步骤。
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
  type AgentSeedStatus,
} from './agent.js';
export type {
  ContentBlock,
  SystemMessage,
  UserMessage,
  ToolCall,
  AssistantMessage,
  ErrorMessage,
  /** 存储层的 App 通知消息；WS 事件版本见 ws.ts 的 AppNotificationEvent */
  AppNotificationMessage,
  /** 存储层的运行时上下文注入消息；前端不渲染 */
  ContextMessage,
  Message,
} from './schema.js';
export type { SessionMeta, Session } from './session.js';
export { buildPreviewText } from './preview.js';
export * from './ws.js';
export type { ProviderStatus } from './provider.js';
export type {
  McpServerStatus,
  SupportedUI,
  McpServerInfo,
  McpOAuthStatus,
} from './mcp.js';
export type { SkillInfo } from './skill.js';
export type { TtsModel, ClonedVoice, VoiceOption, TtsConfig } from './tts.js';
export {
  MarketplaceEntrySchema,
  type MarketplaceEntry,
  McpMarketplaceEntrySchema,
  type McpMarketplaceEntry,
  AgentMarketplaceEntrySchema,
  type AgentMarketplaceEntry,
} from './marketplace.js';
