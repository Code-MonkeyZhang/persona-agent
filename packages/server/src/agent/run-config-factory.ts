/**
 * @fileoverview Factory for creating Agent runtime configuration.
 *
 * Assembles AgentRunConfig from AgentConfig and Session information.
 */

import { getAuth } from '../auth/index.js';
import { getSkills } from '../skill/index.js';
import type { Skill } from '../skill/index.js';
import { getMcpToolsForServer } from '../mcp/index.js';
import {
  BUILTIN_TOOLSETS,
  POSE_TOOLSET_ID,
  effectiveToolNames,
  hasPoseAssets,
  type BuiltinToolDeps,
} from '../tools/index.js';
import { toolRegistry } from '../tools/index.js';
import type { Tool } from '../tools/index.js';
import { findGitBash } from '../util/git-bash-detector.js';
import { isToolNarrationEnabled } from '../config.js';
import { Logger } from '../util/logger.js';
import { MemoryStore, buildPinnedSegment } from './memory/memory-store.js';
import { models } from './pi-models.js';
import type { AgentConfig, AgentRunConfig } from './types.js';
import type { Session } from '../session/types.js';
import type { SessionManager } from '../session/session-manager.js';

/**
 * Build a system prompt with environment context and skills.
 *
 * Output format:
 * ```
 * {basePrompt}
 *
 * ## Environment
 *
 * - Platform: {darwin|linux|win32}
 * - Model: {provider}/{modelId}
 * - Working directory: {workspaceDir}
 *
 * ## Available Skills
 * {manifest statement declaring the list below complete and pool skills not owned}
 *
 * ### {skillName1}
 * [Skill directory: {skillDir1}]
 * Resolve any relative paths in this skill against the above directory.
 *
 * {skillContent1}
 *
 * ## Tool Metadata
 * {narration fields statement, present only when tool narration is enabled}
 * ```
 *
 * 外部服务的清单与状态不在本函数注入，由 runtime-context 的首份清单
 * 与变化通知走动态通道承担。
 *
 * @param basePrompt - Base system prompt from agent configuration
 * @param workspaceDir - Current working directory path
 * @param provider - LLM provider name (e.g. 'openai', 'anthropic')
 * @param modelId - Model identifier string
 * @param skills - Available skills array, optional
 * @returns Complete system prompt with environment context and skills
 */
function buildSystemPrompt(
  basePrompt: string,
  workspaceDir: string,
  provider: string,
  modelId: string,
  skills?: Skill[],
  bashPath?: string | null
): string {
  const platform = process.platform;
  let platformLine: string;
  if (platform === 'win32') {
    platformLine = bashPath
      ? 'win32 (commands run via Git Bash — use Unix syntax: &&, pipes, /dev/null; use Windows-native paths like C:\\Users\\... for file tools)'
      : 'win32 (Git Bash not detected — bash tool is unavailable)';
  } else {
    platformLine = platform;
  }
  // TODO: 写的很杂, 这个迟早要改
  // 日期时间不在此注入——运行时上下文注入机制在消息流末尾提供，见 runtime-context.ts

  let prompt = `${basePrompt}

## Environment

- Platform: ${platformLine}
- Model: ${provider}/${modelId}
- Working directory: ${workspaceDir}`;

  // The skills manifest fixes the agent's self knowledge to the assignment
  // list, so the model answers inventory questions from the prompt instead of
  // enumerating the shared skills directory with file tools.
  if (skills && skills.length > 0) {
    prompt += `

## Available Skills

You have exactly the following skills and no others. When asked which skills you have, report from this list only. The skills directory on disk may contain other installed skills that are not assigned to you; they are not yours, so do not claim, list, or use them.`;

    for (const skill of skills) {
      prompt += `

### ${skill.name}

[Skill directory: ${skill.skillDir}]
Resolve any relative paths in this skill against the above directory.

${skill.content}`;
    }
  } else {
    prompt += `

## Available Skills

No skill is assigned to you. Any skills found on disk belong to the shared pool and are not yours, so do not claim, list, or use them.`;
  }

  // 叙述注入的第二通道，schema 里的说明对模型只是软提示，flash 级模型可能忽略
  if (isToolNarrationEnabled()) {
    prompt += `

## Tool Metadata

调用任何工具时必须同时填写两个额外参数，这两个值会实时显示给用户：

- _title: 两到四个中文词的短标题，说清本次调用在做什么，例如「查滴答清单待办」
- _intent: 一到两句中文说明本次调用的目的，写给用户看

即使工具本身的参数很简单，这两个栏位也必须填写，不得省略。`;
  }

  return prompt;
}

/**
 * 从AgentConfig和Session创建Agent运行时配置。
 *
 * @param agentConfig - 静态Agent配置
 * @param session - 包含模型配置和工作区路径的Session
 * @param workspaceDir - 文件操作的目录路径
 * @param sessionManager - Session管理器，供 GetCurrentPoseTool 读取 pose
 * @returns 完整的AgentRunConfig，可用于实例化AgentCore
 * @throws 如果提供商未配置API密钥则抛出Error
 * @throws 如果模型未知则抛出Error
 */
export function createAgentRunConfig(
  agentConfig: AgentConfig,
  session: Session,
  workspaceDir: string,
  sessionManager: SessionManager
): AgentRunConfig {
  // 会话模型未固化时回落 Agent 默认值,固化由发送链路开头的 ensureModel 完成
  const modelConfig = session.model ?? agentConfig.defaultModel;
  const provider = modelConfig.provider;
  const modelId = modelConfig.model;

  const resolvedBashPath = findGitBash();

  const auth = getAuth(provider);
  if (!auth) {
    throw new Error(`No API key configured for provider: ${provider}`);
  }

  const model = models.getModel(provider, modelId);
  if (!model) {
    throw new Error(`Unknown model: ${provider}/${modelId}`);
  }

  // Load available skills from the pool, skipping unavailable ones
  const skills = agentConfig.skillNames?.length
    ? getSkills(agentConfig.skillNames)
    : [];

  // 分配派生与装配共用 effectiveToolNames 结果，注入与工具页展示同源
  const assignment = new Set(effectiveToolNames(agentConfig));

  let systemPrompt = buildSystemPrompt(
    agentConfig.systemPrompt,
    workspaceDir,
    provider,
    modelId,
    skills,
    resolvedBashPath
  );

  // 常驻记忆板块：每请求一份缝进 system prompt 尾部，全部会话生效，
  // 条目增删后下一轮请求生效。空态整块不追加。
  const pinnedSegment = buildPinnedSegment(
    new MemoryStore(agentConfig.id).listPinnedEnabled()
  );
  if (pinnedSegment) {
    systemPrompt += `\n\n${pinnedSegment}`;
  }

  const builtinDeps: BuiltinToolDeps = {
    workspaceDir,
    bashPath: resolvedBashPath ?? undefined,
    agentId: agentConfig.id,
    sessionId: session.id,
    sessionManager,
  };

  // 装配主链：注册表快照按注册顺序出表，分配记录过滤条目，
  // 内置按定义构造执行体，外部从连接取，顺序稳定保护服务商缓存
  const tools: Tool[] = [];
  const agentAppToolNames = new Set<string>();
  for (const entry of toolRegistry.snapshot()) {
    if (!assignment.has(entry.id)) continue;
    // 立绘条目按 Agent 资产现算可见性，无资产整组不注入
    if (entry.id === POSE_TOOLSET_ID && !hasPoseAssets(agentConfig.id)) {
      continue;
    }
    if (entry.kind === 'builtin') {
      const definition = BUILTIN_TOOLSETS.find((def) => def.id === entry.id);
      if (definition) {
        tools.push(...definition.create(builtinDeps));
      }
      continue;
    }
    const remoteTools = getMcpToolsForServer(entry.id);
    tools.push(...remoteTools);
    if (entry.kind === 'app') {
      for (const tool of remoteTools) {
        agentAppToolNames.add(tool.name);
      }
    }
  }

  Logger.log(
    'TOOLS',
    `Assembled ${tools.length} functions for agent '${agentConfig.id}' from ${assignment.size} assigned entries`
  );

  return {
    agentName: agentConfig.name,
    provider,
    modelId,
    model,
    apiKey: auth.apiKey,
    systemPrompt,
    workspaceDir,
    maxSteps: agentConfig.maxSteps,
    tools,
    agentId: agentConfig.id,
    sessionId: session.id,
    agentAppToolNames,
  };
}
