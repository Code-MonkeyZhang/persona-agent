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
import type {
  AgentConfig,
  AgentRunConfig,
  SystemPromptSegments,
} from './types.js';
import type { Session } from '../session/types.js';
import type { SessionManager } from '../session/session-manager.js';

/**
 * Build a system prompt with environment context and skills.
 *
 * Output format per segment:
 * ```
 * {core}
 *   {basePrompt}
 *   ## Environment (platform, model, working directory)
 *   ## Tool Metadata (narration fields statement, present only when tool narration is enabled)
 *   {pinned memory segment, appended by createAgentRunConfig}
 *
 * {skills}
 *   ## Available Skills (manifest statement declaring the list below complete)
 *   ### {skillName1} [Skill directory: {skillDir1}]
 *   {skillContent1} ...
 * ```
 *
 * 分段结构供占用面板的三段估算取数，createAgentRunConfig 把两段
 * join 成整串填进 systemPrompt，常驻记忆块并入 core 段。
 *
 * 外部服务的清单与状态不在本函数注入，由 runtime-context 的首份清单
 * 与变化通知走动态通道承担。
 *
 * @param basePrompt - Base system prompt from agent configuration
 * @param workspaceDir - Current working directory path
 * @param provider - LLM provider name (e.g. 'openai', 'anthropic')
 * @param modelId - Model identifier string
 * @param skills - Available skills array, optional
 * @returns Complete system prompt split into core and skills segments
 */
function buildSystemPrompt(
  basePrompt: string,
  workspaceDir: string,
  provider: string,
  modelId: string,
  skills?: Skill[],
  bashPath?: string | null
): SystemPromptSegments {
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

  let core = `${basePrompt}

## Environment

- Platform: ${platformLine}
- Model: ${provider}/${modelId}
- Working directory: ${workspaceDir}`;

  // 叙述注入的第二通道，schema 里的说明对模型只是软提示，flash 级模型可能忽略
  if (isToolNarrationEnabled()) {
    core += `

## Tool Metadata

调用任何工具时必须同时填写两个额外参数，这两个值会实时显示给用户：

- _title: 两到四个中文词的短标题，说清本次调用在做什么，例如「查滴答清单待办」
- _intent: 一到两句中文说明本次调用的目的，写给用户看

即使工具本身的参数很简单，这两个栏位也必须填写，不得省略。`;
  }

  // The skills manifest fixes the agent's self knowledge to the assignment
  // list, so the model answers inventory questions from the prompt instead of
  // enumerating the shared skills directory with file tools.
  let skillSections: string;
  if (skills && skills.length > 0) {
    skillSections = `
## Available Skills

You have exactly the following skills and no others. When asked which skills you have, report from this list only. The skills directory on disk may contain other installed skills that are not assigned to you; they are not yours, so do not claim, list, or use them.`;

    for (const skill of skills) {
      skillSections += `

### ${skill.name}

[Skill directory: ${skill.skillDir}]
Resolve any relative paths in this skill against the above directory.

${skill.content}`;
    }
  } else {
    skillSections = `
## Available Skills

No skill is assigned to you. Any skills found on disk belong to the shared pool and are not yours, so do not claim, list, or use them.`;
  }

  return { core, skills: skillSections };
}

/**
 * 组装 Agent 的提示词分段与工具表，派轮与占用刷新共用。
 *
 * 会话模型未固化时回落 Agent 默认值，不含鉴权与模型校验，供无 key 场景估算。
 * 返回的 segments.core 是并入常驻记忆块之后的形态，与派轮的 systemSegments 同源。
 */
export function assembleAgentParts(
  agentConfig: AgentConfig,
  session: Session,
  workspaceDir: string,
  sessionManager: SessionManager
): {
  provider: string;
  modelId: string;
  segments: SystemPromptSegments;
  tools: Tool[];
  agentAppToolNames: Set<string>;
} {
  // 会话模型未固化时回落 Agent 默认值,固化由发送链路开头的 ensureModel 完成
  const modelConfig = session.model ?? agentConfig.defaultModel;
  const provider = modelConfig.provider;
  const modelId = modelConfig.model;

  const resolvedBashPath = findGitBash();

  // Load available skills from the pool, skipping unavailable ones
  const skills = agentConfig.skillNames?.length
    ? getSkills(agentConfig.skillNames)
    : [];

  // 分配派生与装配共用 effectiveToolNames 结果，注入与工具页展示同源
  const assignment = new Set(effectiveToolNames(agentConfig));

  // 分段返回后常驻记忆块并入 core 段，两段 join 成整串，行为对模型等价
  const segments = buildSystemPrompt(
    agentConfig.systemPrompt,
    workspaceDir,
    provider,
    modelId,
    skills,
    resolvedBashPath
  );

  // 常驻记忆板块：每请求一份缝进 core 段尾部，全部会话生效，
  // 条目增删后下一轮请求生效。空态整块不追加。
  const pinnedSegment = buildPinnedSegment(
    new MemoryStore(agentConfig.id).listPinnedEnabled()
  );
  const core = pinnedSegment
    ? `${segments.core}\n\n${pinnedSegment}`
    : segments.core;

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

  return {
    provider,
    modelId,
    segments: { core, skills: segments.skills },
    tools,
    agentAppToolNames,
  };
}

/**
 * 从AgentConfig和Session创建Agent运行时配置。
 *
 * 装配主链经 {@link assembleAgentParts} 完成，此处补鉴权与模型校验并拼整串
 * system prompt。
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
  const { provider, modelId, segments, tools, agentAppToolNames } =
    assembleAgentParts(agentConfig, session, workspaceDir, sessionManager);

  const auth = getAuth(provider);
  if (!auth) {
    throw new Error(`No API key configured for provider: ${provider}`);
  }

  const model = models.getModel(provider, modelId);
  if (!model) {
    throw new Error(`Unknown model: ${provider}/${modelId}`);
  }

  Logger.log(
    'TOOLS',
    `Assembled ${tools.length} functions for agent '${agentConfig.id}' from ${effectiveToolNames(agentConfig).length} assigned entries`
  );

  return {
    agentName: agentConfig.name,
    provider,
    modelId,
    model,
    apiKey: auth.apiKey,
    systemPrompt: [segments.core, segments.skills].join('\n\n'),
    systemSegments: segments,
    workspaceDir,
    maxSteps: agentConfig.maxSteps,
    tools,
    agentId: agentConfig.id,
    sessionId: session.id,
    agentAppToolNames,
  };
}
