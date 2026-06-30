/**
 * @fileoverview Factory for creating Agent runtime configuration.
 *
 * Assembles AgentRunConfig from AgentConfig and Session information.
 */

import { getModel, type KnownProvider } from '@earendil-works/pi-ai';
import { getAuth } from '../auth/index.js';
import { getSkills } from '../skill/index.js';
import type { Skill } from '../skill/index.js';
import { getMcpToolsForServers, getMcpPromptInfo } from '../mcp/index.js';
import {
  ReadTool,
  WriteTool,
  EditTool,
  BashTool,
  BashOutputTool,
  BashKillTool,
  WebFetchTool,
} from '../tools/index.js';
import { ShowPoseTool, GetCurrentPoseTool } from '../tools/pose-tools.js';
import { findGitBash } from '../util/git-bash-detector.js';
import { MemoryStore } from './memory/memory-store.js';
import type { AgentConfig, AgentRunConfig } from './types.js';
import type { Session } from '../session/types.js';

/**
 * Build a system prompt with environment context, skills, and MCP server info.
 *
 * Output format:
 * ```
 * {basePrompt}
 *
 * ## Environment
 *
 * - Platform: {darwin|linux|win32}
 * - Date: {YYYY-MM-DD HH:mm (UTC+X)}
 * - Model: {provider}/{modelId}
 * - Working directory: {workspaceDir}
 *
 * ## Available Skills
 *
 * ### {skillName1}
 * [Skill directory: {skillDir1}]
 * Resolve any relative paths in this skill against the above directory.
 *
 * {skillContent1}
 * ```
 *
 * @param basePrompt - Base system prompt from agent configuration
 * @param workspaceDir - Current working directory path
 * @param provider - LLM provider name (e.g. 'openai', 'anthropic')
 * @param modelId - Model identifier string
 * @param skills - Available skills array, optional
 * @param mcpNames - MCP server names for status display, optional
 * @returns Complete system prompt with environment context and skills
 */
function buildSystemPrompt(
  basePrompt: string,
  workspaceDir: string,
  provider: string,
  modelId: string,
  skills?: Skill[],
  mcpNames?: string[],
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
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const offset = -now.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const absOffset = Math.abs(offset);
  const tz = `UTC${sign}${Math.floor(absOffset / 60)}${absOffset % 60 > 0 ? `:${pad(absOffset % 60)}` : ''}`;
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())} (${tz})`;

  let prompt = `${basePrompt}

## Environment

- Platform: ${platformLine}
- Date: ${date}
- Model: ${provider}/${modelId}
- Working directory: ${workspaceDir}`;

  if (skills && skills.length > 0) {
    prompt += `

## Available Skills`;

    for (const skill of skills) {
      prompt += `

### ${skill.name}

[Skill directory: ${skill.skillDir}]
Resolve any relative paths in this skill against the above directory.

${skill.content}`;
    }
  }

  if (mcpNames && mcpNames.length > 0) {
    const mcpInfo = getMcpPromptInfo(mcpNames);
    prompt += `

## MCP Servers`;

    for (const { name, status } of mcpInfo) {
      prompt += `
- ${name}: ${status}`;
    }
  }

  return prompt;
}

/**
 * 从AgentConfig和Session创建Agent运行时配置。
 *
 * @param agentConfig - 静态Agent配置
 * @param session - 包含模型配置和工作区路径的Session
 * @param workspaceDir - 文件操作的目录路径
 * @returns 完整的AgentRunConfig，可用于实例化AgentCore
 * @throws 如果提供商未配置API密钥则抛出Error
 * @throws 如果模型未知则抛出Error
 */
export function createAgentRunConfig(
  agentConfig: AgentConfig,
  session: Session,
  workspaceDir: string
): AgentRunConfig {
  const modelConfig = session.model;
  const provider = modelConfig.provider as KnownProvider;
  const modelId = modelConfig.model;

  const resolvedBashPath = findGitBash();

  const auth = getAuth(provider);
  if (!auth) {
    throw new Error(`No API key configured for provider: ${provider}`);
  }

  const model = getModel(provider, modelId as Parameters<typeof getModel>[1]);
  if (!model) {
    throw new Error(`Unknown model: ${provider}/${modelId}`);
  }

  // Load available skills from the pool, skipping unavailable ones
  const skills = agentConfig.skillNames?.length
    ? getSkills(agentConfig.skillNames)
    : [];

  let systemPrompt = buildSystemPrompt(
    agentConfig.systemPrompt,
    workspaceDir,
    provider,
    modelId,
    skills,
    agentConfig.mcpNames,
    resolvedBashPath
  );

  // 聊天 Session：在系统提示词末尾追加长期记忆与近期未整理的摘要
  if (session.id.startsWith('chat')) {
    const memory = new MemoryStore(agentConfig.id);
    const memoryMd = memory.readMemoryMd();
    if (memoryMd) {
      systemPrompt += `\n\n# Memory\n\n${memoryMd}`;
    }
    const recentHistory = memory.readRecentHistorySegment();
    if (recentHistory) {
      systemPrompt += `\n\n# Recent History\n\n${recentHistory}`;
    }
  }

  const mcpTools = agentConfig.mcpNames?.length
    ? getMcpToolsForServers(agentConfig.mcpNames)
    : [];

  const tools = [
    new ReadTool(workspaceDir),
    new WriteTool(workspaceDir),
    new EditTool(workspaceDir),
    new BashTool(resolvedBashPath ?? undefined),
    new BashOutputTool(),
    new BashKillTool(),
    new WebFetchTool(),
    new ShowPoseTool(agentConfig.id),
    new GetCurrentPoseTool(agentConfig.id),
    ...mcpTools,
  ];

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
  };
}
