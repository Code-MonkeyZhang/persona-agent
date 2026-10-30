/**
 * @file 会话时间线的行语言底座，身份图标、动向句与运行态类型的唯一定义
 * 消息内思考过程与顶栏时间线都从这里取口径，行语言在桌面端只此一处
 * 组件本体与三档挂载在后续 stage 落地，本文件不承载渲染
 */

import {
  FilePlus,
  FileText,
  Globe,
  Lightbulb,
  Pencil,
  Smile,
  TerminalSquare,
  type LucideIcon,
} from 'lucide-react';
import { baseName, summarizeToolInput, trunc } from '@persona/shared';
import type { Thought } from '../../types/chat';

/** 实时步骤条的一步，tool 为空串代表思考段，detail 是参数摘要或思考段正文
 *  input 与 output 是工具步的原始入参与原始输出 JSON 字符串，供详情浮层消费
 *  failed 标记工具步失败，行渲染走红字加 circle-x，错误明细只进详情浮层 */
export interface LiveStep {
  tool: string;
  detail: string;
  startedAt: number;
  endedAt?: number;
  input?: string;
  output?: string;
  failed?: boolean;
}

/** 回合运行期的实时状态，null 表示空闲，顶条与时间线据此渲染活动尾巴 */
export interface LiveRunState {
  steps: LiveStep[];
}

/** 工具名到行前置位身份图标的映射，未登记工具回退文档图标 */
const TOOL_ICONS: Record<string, LucideIcon> = {
  read_file: FileText,
  write_file: FilePlus,
  edit_file: Pencil,
  bash: TerminalSquare,
  bash_output: TerminalSquare,
  bash_kill: TerminalSquare,
  web_fetch: Globe,
  show_pose: Smile,
  get_current_pose: Smile,
};

/**
 * 取工具步的身份图标，行前置位任何时候都是身份图标，成功失败不抢图标位
 * @param tool 工具实名
 */
export function toolIcon(tool: string): LucideIcon {
  return TOOL_ICONS[tool] ?? FileText;
}

/**
 * 单个步骤的自然语言动向句，动词加真实对象为主，拼不到对象回退该工具的纯动词形态
 * 未登记的第三方工具统一回退 正在执行 加工具名由调用方拼接
 * @param t 文案函数
 * @param step 待叙述的步骤
 */
export function stepPhrase(t: (key: string) => string, step: LiveStep): string {
  switch (step.tool) {
    case '':
      return t('live.thinking');
    case 'read_file':
      return step.detail
        ? `${t('live.read')} ${baseName(step.detail)}`
        : t('live.readFallback');
    case 'write_file':
      return step.detail
        ? `${t('live.write')} ${baseName(step.detail)}`
        : t('live.writeFallback');
    case 'edit_file':
      return step.detail
        ? `${t('live.edit')} ${baseName(step.detail)}`
        : t('live.editFallback');
    case 'bash':
      return step.detail
        ? `${t('live.bash')} ${trunc(step.detail, 24)}`
        : t('live.bashFallback');
    case 'bash_output':
      return t('live.bashOutput');
    case 'bash_kill':
      return t('live.bashKill');
    case 'web_fetch':
      return step.detail
        ? `${t('live.webfetch')} ${step.detail}`
        : t('live.webfetchFallback');
    case 'show_pose':
      return t('live.showPose');
    case 'get_current_pose':
      return t('live.getPose');
    default:
      return `${t('live.executing')} ${step.tool}`;
  }
}

/**
 * 消息内思考过程行的适配器，把 Thought 的 toolInput 经摘要转成动向句
 * 思考行与错误行原样返回正文
 * @param t 文案函数
 * @param thought 待叙述的思考步骤
 */
export function phraseForThought(
  t: (key: string) => string,
  thought: Thought
): string {
  if (thought.type !== 'tool_use') return thought.content ?? '';
  return stepPhrase(t, {
    tool: thought.toolName ?? '',
    detail: summarizeToolInput(thought.toolName ?? '', thought.toolInput),
    startedAt: 0,
    endedAt: 1,
  });
}

/**
 * 状态条当前动作文案推导，两态纯函数，有未闭合工具步则工具执行叙述，否则思考中
 * @param t 文案函数
 * @param liveRun 当前回合的实时状态
 */
export function liveRunLabel(
  t: (key: string) => string,
  liveRun: LiveRunState
): string {
  const active = [...liveRun.steps].reverse().find((s) => !s.endedAt);
  return active ? stepPhrase(t, active) : t('live.thinking');
}

/**
 * 顶条图标位随相位换身份图标，两态纯函数，活动工具步取工具身份，思考中灯泡
 * @param liveRun 当前回合的实时状态
 */
export function phaseIcon(liveRun: LiveRunState): LucideIcon {
  const active = [...liveRun.steps].reverse().find((s) => !s.endedAt);
  if (!active || active.tool === '') return Lightbulb;
  return toolIcon(active.tool);
}
