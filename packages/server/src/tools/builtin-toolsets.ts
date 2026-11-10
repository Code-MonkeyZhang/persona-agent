/**
 * @fileoverview 内置工具集定义，五组条目的声明式清单。
 *
 * 定义是静态的，server 启动时投影成注册表条目登记，条目顺序即定义顺序。
 * 执行体按会话构造，create 收会话依赖返回实例，功能全名在这里统一加条目前缀，
 * 前缀知识不散进各工具类，九个既有类的接口边界零改动。
 */

import * as fs from 'node:fs';
import type { Tool } from './base.js';
import { ReadTool, WriteTool, EditTool } from './file-tools.js';
import { BashTool, BashOutputTool, BashKillTool } from './bash-tool.js';
import { WebFetchTool } from './webfetch/index.js';
import { ShowPoseTool, GetCurrentPoseTool } from './pose-tools.js';
import {
  MemoryWriteTool,
  MemoryUpdateTool,
  MemoryForgetTool,
  MemorySearchTool,
} from './memory-tools.js';
import type { SessionManager } from '../session/session-manager.js';
import { getAgentAssetsPoseDir } from '../util/paths.js';
import { Logger } from '../util/logger.js';
import { toolRegistry } from './registry.js';
import type { RegistryEntry, RegistryFunction } from './registry.js';
import { POSE_TOOLSET_ID } from './tool-ids.js';

export {
  BUILTIN_TOOLSET_IDS,
  BUILTIN_TOOLSET_ID_SET,
  POSE_TOOLSET_ID,
  effectiveToolNames,
} from './tool-ids.js';

/** 会话级构造依赖，五个 create 各取所需 */
export interface BuiltinToolDeps {
  workspaceDir: string;
  bashPath?: string;
  agentId: string;
  sessionId: string;
  sessionManager: SessionManager;
}

/** 内置工具集定义的静态形状，中文是基底字段，En 后缀是英文覆盖字段 */
export interface ToolsetDefinition {
  id: string;
  name: string;
  /** 显示名的英文覆盖，投影按请求语言择一 */
  nameEn?: string;
  description: string;
  /** 条目描述的英文覆盖 */
  descriptionEn?: string;
  /** 详情页文档，经注册表条目透出给前端渲染 */
  instructions: string;
  /** 详情页文档的英文整篇覆盖 */
  instructionsEn?: string;
  functions: {
    shortName: string;
    description: string;
    /** 功能说明的英文覆盖 */
    descriptionEn?: string;
  }[];
  create(deps: BuiltinToolDeps): Tool[];
}

/** 功能全名等于条目 id 加双下划线加短名，命名规则唯一落点 */
export function toFullName(entryId: string, shortName: string): string {
  return `${entryId}__${shortName}`;
}

/**
 * 拆开功能全名，返回条目 id 与短名。
 * 与 toFullName 成对，命名规则的组合与解析都只落在这里。
 * 无双下划线返回 undefined，调用方按无前缀名字处理。
 * @param fullName 功能全名或无前缀名字
 */
export function splitFullName(
  fullName: string
): { entryId: string; shortName: string } | undefined {
  const sep = fullName.indexOf('__');
  if (sep === -1) return undefined;
  return {
    entryId: fullName.slice(0, sep),
    shortName: fullName.slice(sep + 2),
  };
}

/** 构造完成后统一改全名 */
function prefixed(id: string, tools: Tool[]): Tool[] {
  for (const tool of tools) {
    tool.name = toFullName(id, tool.name);
  }
  return tools;
}

const TERMINAL_INSTRUCTIONS = `## 能力说明

在独立的 shell 进程里执行命令并取回输出，适合构建、脚本执行与系统排查。

## 执行方式

- 前台执行会在命令结束后一次性返回全部输出
- 后台执行立即返回任务号，长时命令不阻塞会话
- 输出包含标准流与错误流，超长时自动截断并保留首尾

## 安全边界

- 每条命令有独立的超时，超时自动终止进程
- 涉及删除或系统修改的命令会在会话内先请求确认`;

const TERMINAL_INSTRUCTIONS_EN = `## What it does

Runs commands in a separate shell process and returns the output, suited to builds, scripts, and system inspection.

## How to use it

- Foreground runs return the full output once the command finishes
- Background runs return a job id immediately, so long commands never block the session
- Output merges the standard and error streams, and very long output is truncated keeping head and tail

## Safety

- Each command has its own timeout, and the process is terminated when it expires
- Destructive or system changing commands ask for confirmation in the session first`;

const FILES_INSTRUCTIONS = `## 能力说明

覆盖读取、写入与精确局部修改，是所有文件类任务的基础设施。

## 使用方式

- 读取按路径返回文本内容，超长文件自动分段
- 写入整份覆盖目标文件，编辑只替换匹配到的片段
- 编辑要求给出唯一的锚文本，多处匹配时拒绝执行

## 安全边界

- 路径限制在工作区内，越界访问会被拒绝
- 二进制文件不做内容编辑，只返回占位信息`;

const FILES_INSTRUCTIONS_EN = `## What it does

Covers reading, writing, and precise partial edits, the foundation for every file task.

## How to use it

- Reading returns text content by path, and very long files are chunked automatically
- Writing replaces the whole file, while editing replaces only the matched fragment
- Editing requires a unique anchor text, and refuses to run when the anchor matches multiple places

## Safety

- Paths are confined to the workspace, and out of bounds access is rejected
- Binary files are never content edited, and only a placeholder is returned`;

const WEB_INSTRUCTIONS = `## 能力说明

抓取网页并把正文转为文本，适合查资料、读文档与提取链接。

## 使用方式

- 给出完整 URL，返回去噪后的正文文本
- 重定向自动跟随，超时与体积有上限保护

## 安全边界

- 内网地址与非常规协议会被 SSRF 防护拦截`;

const WEB_INSTRUCTIONS_EN = `## What it does

Fetches a web page and turns its body into readable text, suited to research, reading docs, and extracting links.

## How to use it

- Give a full URL and get back the denoised body text
- Redirects are followed automatically, with timeout and size caps as protection

## Safety

- Intranet addresses and unusual protocols are blocked by SSRF protection`;

const POSE_INSTRUCTIONS = `## 能力说明

切换与查询陪伴立绘正在显示的表情，让对话中的情绪变化同步到形象上。

## 使用方式

- show_pose 按表情名切换立绘，表情名来自该 Agent 的立绘资产清单
- get_current_pose 查询当前正在显示的表情

## 安全边界

- 表情名不存在时切换会被拒绝`;

const POSE_INSTRUCTIONS_EN = `## What it does

Switches and queries the expression shown on the companion avatar, so mood changes in the conversation reach the character.

## How to use it

- show_pose switches the avatar expression by name, and names come from the agent's pose asset list
- get_current_pose queries which expression is showing now

## Safety

- Unknown expression names are rejected`;

const MEMORY_INSTRUCTIONS = `## 能力说明

维护关于用户的长期记忆，条目跨会话持久保存。常驻条目每轮注入，触发条目在话题命中时自动送入对话。

## 使用方式

- write 新增一条记忆，content 是一句自含的事实
- update 按编号修改条目，只传要改的字段
- forget 按编号删除，立即生效
- search 按关键词检索，不知道编号时先查

## 安全边界

- 只记持久事实，不记一次性请求细节与本轮发生的事
- 同文条目会被查重拦截，重复内容走 update 修改已有条目`;

const MEMORY_INSTRUCTIONS_EN = `## What it does

Maintains long-term notes about the user, persisted across sessions. Pinned entries are injected every turn, and triggered entries enter the conversation when their topic comes up.

## How to use it

- write saves a new entry where content is one self-contained fact
- update changes an entry by number, passing only the fields to change
- forget deletes an entry by number and takes effect immediately
- search looks up entries by keyword, and is the first stop when the number is unknown

## Safety

- Only durable facts are stored, never one-off request details or things from the current turn
- Identical entries are rejected by dedup, and repeats should update the existing entry instead`;

/** 五组定义，create 里的构造参数与各工具类的既有签名一致 */
export const BUILTIN_TOOLSETS: ToolsetDefinition[] = [
  {
    id: 'built_in_terminal',
    name: '终端操作',
    nameEn: 'Terminal',
    description: '执行命令，支持前台与后台',
    descriptionEn: 'Run commands, foreground or background',
    instructions: TERMINAL_INSTRUCTIONS,
    instructionsEn: TERMINAL_INSTRUCTIONS_EN,
    functions: [
      {
        shortName: 'bash',
        description: '在 shell 里执行命令并取回输出',
        descriptionEn: 'Run a command in the shell and return its output',
      },
      {
        shortName: 'bash_output',
        description: '取回后台命令的增量输出',
        descriptionEn: 'Fetch incremental output of a background command',
      },
      {
        shortName: 'bash_kill',
        description: '终止指定的后台命令',
        descriptionEn: 'Terminate a background command',
      },
    ],
    create: (deps) =>
      prefixed('built_in_terminal', [
        new BashTool(deps.bashPath),
        new BashOutputTool(),
        new BashKillTool(),
      ]),
  },
  {
    id: 'built_in_files',
    name: '文件操作',
    nameEn: 'Files',
    description: '读取、写入与局部编辑文件',
    descriptionEn: 'Read, write, and edit files locally',
    instructions: FILES_INSTRUCTIONS,
    instructionsEn: FILES_INSTRUCTIONS_EN,
    functions: [
      {
        shortName: 'read_file',
        description: '读取指定路径的文件内容',
        descriptionEn: 'Read the file at a given path',
      },
      {
        shortName: 'write_file',
        description: '将内容写入指定路径',
        descriptionEn: 'Write full content to a given path',
      },
      {
        shortName: 'edit_file',
        description: '对文件做精确的局部修改',
        descriptionEn: 'Apply a precise anchored edit to a file',
      },
    ],
    create: (deps) =>
      prefixed('built_in_files', [
        new ReadTool(deps.workspaceDir),
        new WriteTool(deps.workspaceDir),
        new EditTool(deps.workspaceDir),
      ]),
  },
  {
    id: 'built_in_web',
    name: '网页',
    nameEn: 'Web',
    description: '抓取网页并转为可读文本',
    descriptionEn: 'Fetch a page and turn it into readable text',
    instructions: WEB_INSTRUCTIONS,
    instructionsEn: WEB_INSTRUCTIONS_EN,
    functions: [
      {
        shortName: 'web_fetch',
        description: '抓取指定 URL 的网页内容',
        descriptionEn: 'Fetch the page at a URL as readable text',
      },
    ],
    create: () => prefixed('built_in_web', [new WebFetchTool()]),
  },
  {
    id: POSE_TOOLSET_ID,
    name: '立绘表情',
    nameEn: 'Pose',
    description: '切换陪伴立绘的表情',
    descriptionEn: 'Control the companion avatar expression',
    instructions: POSE_INSTRUCTIONS,
    instructionsEn: POSE_INSTRUCTIONS_EN,
    functions: [
      {
        shortName: 'show_pose',
        description: '切换陪伴立绘的表情',
        descriptionEn: 'Switch the avatar expression',
      },
      {
        shortName: 'get_current_pose',
        description: '查询当前正在显示的表情',
        descriptionEn: 'Query the currently shown expression',
      },
    ],
    create: (deps) =>
      prefixed(POSE_TOOLSET_ID, [
        new ShowPoseTool(deps.agentId),
        new GetCurrentPoseTool(deps.sessionManager, deps.sessionId),
      ]),
  },
  {
    id: 'built_in_memory',
    name: '记忆',
    nameEn: 'Memory',
    description: '读写关于用户的长期记忆条目',
    descriptionEn: 'Store and recall long-term entries about the user',
    instructions: MEMORY_INSTRUCTIONS,
    instructionsEn: MEMORY_INSTRUCTIONS_EN,
    functions: [
      {
        shortName: 'write',
        description: '保存一条新记忆条目',
        descriptionEn: 'Save a new memory entry',
      },
      {
        shortName: 'update',
        description: '按编号修改既有条目',
        descriptionEn: 'Update an entry by its number',
      },
      {
        shortName: 'forget',
        description: '按编号删除一条条目',
        descriptionEn: 'Delete an entry by its number',
      },
      {
        shortName: 'search',
        description: '按关键词查找条目',
        descriptionEn: 'Search entries by keyword',
      },
    ],
    create: (deps) =>
      prefixed('built_in_memory', [
        new MemoryWriteTool(deps.agentId),
        new MemoryUpdateTool(deps.agentId),
        new MemoryForgetTool(deps.agentId),
        new MemorySearchTool(deps.agentId),
      ]),
  },
];

/**
 * 立绘条目可见性，Agent 的 pose 资产目录非空才可见。
 * 装配与 API 投影共用，注入与展示同源。
 */
export function hasPoseAssets(agentId: string): boolean {
  try {
    const dir = getAgentAssetsPoseDir(agentId);
    return fs.existsSync(dir) && fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

/**
 * 启动时把五个内置条目登记进注册表。
 *
 * 幂等，重复调用只登记一次。模块装载时自动执行，
 * 任何导入方跑起装配或 API 前内置条目必然在表，不依赖 http-server 的启动顺序。
 * 内置 id 是固定五个，登记失败按错误落日志不阻断启动。
 */
export function registerBuiltinToolsets(): void {
  for (const def of BUILTIN_TOOLSETS) {
    if (toolRegistry.get(def.id)) continue;
    const functions: RegistryFunction[] = def.functions.map((fn) => ({
      name: toFullName(def.id, fn.shortName),
      shortName: fn.shortName,
      description: fn.description,
      descriptionEn: fn.descriptionEn,
    }));
    const entry: RegistryEntry = {
      id: def.id,
      kind: 'builtin',
      name: def.name,
      nameEn: def.nameEn,
      description: def.description,
      descriptionEn: def.descriptionEn,
      status: 'connected',
      functions,
      meta: {
        instructions: def.instructions,
        instructionsEn: def.instructionsEn,
      },
    };
    try {
      toolRegistry.register(entry);
    } catch (error) {
      Logger.log(
        'ERROR',
        `Failed to register builtin toolset '${def.id}': ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

registerBuiltinToolsets();
