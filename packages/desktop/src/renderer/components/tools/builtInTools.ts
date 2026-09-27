/**
 * @file src/renderer/components/tools/builtInTools.ts
 * @description 内置工具清单与工具页选中态的共享定义
 * 内置工具在类型上就是一个常驻的内部 MCP，每项自带工具集合与文档，
 * 工具名与 server 侧 tools 注册表对齐，Agent App 走 mcp 通道不单列
 */

import { Terminal, FileText, Globe, type LucideIcon } from 'lucide-react';
import type { McpToolInfo } from '@persona/shared';

export interface BuiltInTool {
  id: string;
  icon: LucideIcon;
  name: string;
  desc: string;
  /** 该内置项暴露的工具集合，展示形态与 MCP 的 tools 一致 */
  tools: McpToolInfo[];
  /** 内置文档，详情页文档段按 markdown 渲染 */
  instructions: string;
}

/** 工具页左栏与右栏共用的选中态坐标，mcp 涵盖普通服务与 Agent App */
export type ToolSelection =
  | { kind: 'builtin'; id: string }
  | { kind: 'mcp'; id: string };

/** 选中项是否仍落在内置清单或当前服务列表内 */
export function isToolSelectionValid(
  selection: ToolSelection,
  servers: { name: string }[]
): boolean {
  if (selection.kind === 'builtin') {
    return BUILT_IN_TOOLS.some((t) => t.id === selection.id);
  }
  return servers.some((s) => s.name === selection.id);
}

/** 内置工具清单，终端、文件与网页各算一项 */
export const BUILT_IN_TOOLS: BuiltInTool[] = [
  {
    id: 'bash',
    icon: Terminal,
    name: '终端操作',
    desc: '执行命令，支持前台与后台',
    tools: [
      { name: 'bash', description: '在 shell 里执行命令并取回输出' },
      {
        name: 'bash_output',
        description: '取回后台命令的增量输出',
      },
      { name: 'bash_kill', description: '终止指定的后台命令' },
    ],
    instructions: `## 能力说明

在独立的 shell 进程里执行命令并取回输出，适合构建、脚本执行与系统排查。

## 执行方式

- 前台执行会在命令结束后一次性返回全部输出
- 后台执行立即返回任务号，长时命令不阻塞会话
- 输出包含标准流与错误流，超长时自动截断并保留首尾

## 安全边界

- 每条命令有独立的超时，超时自动终止进程
- 涉及删除或系统修改的命令会在会话内先请求确认`,
  },
  {
    id: 'file',
    icon: FileText,
    name: '文件操作',
    desc: '读取、写入与局部编辑文件',
    tools: [
      { name: 'read_file', description: '读取指定路径的文件内容' },
      { name: 'write_file', description: '将内容写入指定路径的文件' },
      { name: 'edit_file', description: '对文件做精确的局部修改' },
    ],
    instructions: `## 能力说明

覆盖读取、写入与精确局部修改，是所有文件类任务的基础设施。

## 使用方式

- 读取按路径返回文本内容，超长文件自动分段
- 写入整份覆盖目标文件，编辑只替换匹配到的片段
- 编辑要求给出唯一的锚文本，多处匹配时拒绝执行

## 安全边界

- 路径限制在工作区内，越界访问会被拒绝
- 二进制文件不做内容编辑，只返回占位信息`,
  },
  {
    id: 'web-fetch',
    icon: Globe,
    name: '网页',
    desc: '抓取网页并转为可读文本',
    tools: [{ name: 'web_fetch', description: '抓取指定 URL 的网页内容' }],
    instructions: `## 能力说明

抓取网页并把正文转为文本，适合查资料、读文档与提取链接。

## 使用方式

- 给出完整 URL，返回去噪后的正文文本
- 重定向自动跟随，超时与体积有上限保护

## 安全边界

- 内网地址与非常规协议会被 SSRF 防护拦截`,
  },
];
