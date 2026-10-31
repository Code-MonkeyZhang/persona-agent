/**
 * @file 会话时间线的行语言底座与顶栏时间线组件
 * 行语言在桌面端只此一处定义，消息内思考过程与顶栏时间线都从这里取口径
 * 时间线三档浮在消息区上方不占布局，消息区高度恒定，行数据从消息流加运行缓冲推导不新增存储
 * 档位偏好经 localStorage 跨启动记忆，只记 line 与 hair 两态，中止的轮次不落盘，时间线上它没有发生过
 */

import { useMemo, useState } from 'react';
import { Virtuoso } from 'react-virtuoso';
import {
  ArrowUpRight,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  FilePlus,
  FileText,
  Globe,
  Lightbulb,
  MessageSquare,
  Pencil,
  Smile,
  TerminalSquare,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { baseName, summarizeToolInput, trunc } from '@persona/shared';
import { useChatStore } from '../../stores/chatStore';
import { RowDetailDialog, type RowDetail } from './RowDetailDialog';
import type { Thought, UIMessage } from '../../types/chat';

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
 * 未登记的第三方工具统一回退 正在执行 加工具名
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

/** 展开区时间线的高度上限，超出内部滚动 */
const PANEL_MAX_H = 288;

/** 空闲摘要回退不到工具步数时，用户消息行的截断上限 */
const USER_LABEL_MAX = 24;

/** messages 选择器的稳定空数组，避免每次快照新建引用触发多余渲染 */
const EMPTY_MESSAGES: UIMessage[] = [];

/** 运行指示的三颗呼吸圆点，紧跟文字右侧由行 gap 提供间距，主色 4px 单颗 1.2s 相位各差 0.2s */
function Dots({ className = '' }: { className?: string }) {
  return (
    <span
      className={`tl-dots shrink-0 pointer-events-none ${className}`}
      aria-hidden
    >
      <i />
      <i />
      <i />
    </span>
  );
}

/** 时间线行数据，kind 区分三类条目，live 标记运行期未闭合的活动行
 *  synthetic 标记思考间隙补出的思考中活动行，文本渲染时取文案不存值
 *  工具行带 input 与 output 原始 JSON 字符串，完成的行点开调用详情浮层 */
export type TimelineRowData =
  | { kind: 'user'; text: string }
  | { kind: 'think'; text: string; live?: boolean; synthetic?: boolean }
  | {
      kind: 'tool';
      tool: string;
      detail: string;
      live?: boolean;
      failed?: boolean;
      input?: string;
      output?: string;
    };

/**
 * 把会话消息流摊平成时间线行，顺序即发生顺序
 * 用户消息出用户行，assistant 消息思考段出思考行，工具调用出工具行带参数摘要
 * text 步骤由气泡正文承担不进行，与消息内思考过程同一过滤口径
 * 落盘行与运行行的失败判定同源，读 thought 的 isError 与 toolResult 的 isError
 * 运行期 liveRun 的步骤作为活动尾巴接在末尾，当前轮的消息还没落盘由它补齐
 * 运行中没有未闭合的工具步即处于思考间隙，补一条思考中活动行
 * @param messages 当前会话消息流
 * @param liveRun 运行期实时状态，空闲传 null
 */
export function buildRows(
  messages: UIMessage[],
  liveRun: LiveRunState | null
): TimelineRowData[] {
  const rows: TimelineRowData[] = [];
  for (const m of messages) {
    if (m.type === 'user') {
      rows.push({ kind: 'user', text: m.content });
      continue;
    }
    for (const th of m.thoughts ?? []) {
      if (th.type === 'tool_use') {
        rows.push({
          kind: 'tool',
          tool: th.toolName ?? '',
          detail: summarizeToolInput(th.toolName ?? '', th.toolInput),
          failed: th.isError || th.toolResult?.isError || undefined,
          input: th.toolInput ? JSON.stringify(th.toolInput) : undefined,
          output: th.toolResult?.output,
        });
      } else if (th.type === 'thinking' && th.content) {
        rows.push({ kind: 'think', text: th.content });
      }
    }
  }
  if (liveRun) {
    for (const st of liveRun.steps) {
      const live = st.endedAt === undefined;
      if (st.tool === '') {
        rows.push({ kind: 'think', text: st.detail, live });
      } else {
        rows.push({
          kind: 'tool',
          tool: st.tool,
          detail: st.detail,
          live,
          failed: st.failed,
          input: st.input,
          output: st.output,
        });
      }
    }
    if (!liveRun.steps.some((s) => s.tool !== '' && s.endedAt === undefined)) {
      rows.push({ kind: 'think', text: '', live: true, synthetic: true });
    }
  }
  return rows;
}

/** i18n 文案函数的最小形状，供纯函数与测试共用 */
export type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * 空闲态一行档摘要，从最后一条带工具步的 assistant 消息现算步数与失败步数
 * 失败轮输出 doneFail 红字整句，成功轮输出 done 步数，不落任何驻留字段
 * 回退不到工具步数时取最后一条用户消息截断，无消息显示思考中
 * @param t 文案函数
 * @param messages 当前会话消息流
 */
export function idleLabel(
  t: Translate,
  messages: UIMessage[]
): { text: string; failed: boolean } {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type !== 'assistant' || !m.thoughts?.length) continue;
    const tools = m.thoughts.filter((th) => th.type === 'tool_use');
    if (tools.length === 0) continue;
    const fails = tools.filter(
      (th) => th.isError || th.toolResult?.isError
    ).length;
    return fails > 0
      ? {
          text: t('live.doneFail', { count: tools.length, fails }),
          failed: true,
        }
      : { text: t('live.done', { count: tools.length }), failed: false };
  }
  const last = messages[messages.length - 1];
  if (last?.type === 'user') {
    return { text: trunc(last.content, USER_LABEL_MAX), failed: false };
  }
  return { text: t('live.thinking'), failed: false };
}

/** 顶条三档，line 留一行，open 完全展开，hair 完全收起只剩发丝线 */
type StripMode = 'line' | 'open' | 'hair';

/** 档位偏好的持久化键，与 agentStore 的 LAST_AGENT_KEY 同走 localStorage 直读直写 */
const STRIP_MODE_KEY = 'persona/stripMode';

/**
 * 读持久化的档位偏好，只认 line 与 hair 两值，open 是 line 的展开形态不落盘，坏值回落 line
 * 无 localStorage 的测试环境读取抛错，按未设置回落 line
 */
function readPersistedMode(): StripMode {
  try {
    return localStorage.getItem(STRIP_MODE_KEY) === 'hair' ? 'hair' : 'line';
  } catch {
    return 'line';
  }
}

/** 写档位偏好，环境不可写时静默跳过，偏好丢失不影响功能 */
function persistMode(mode: StripMode): void {
  try {
    localStorage.setItem(STRIP_MODE_KEY, mode);
  } catch {
    // 测试环境无 localStorage，跳过
  }
}

// 档位偏好跨启动落盘，模块变量在本次进程内承接，组件随会话切换卸载不丢
let lastMode: StripMode = readPersistedMode();

/** Virtuoso 的 components 需模块级稳定引用，顶部 4px 对齐原列表上留白 */
const ListTopPad = () => <div className="h-1" />;

/** 底部留白 20px，贴底跟随时最新一行停在底部渐隐上方不被压住 */
const ListBottomPad = () => <div className="h-5" />;

/**
 * 顶栏会话时间线，挂在 Header 下方浮在消息区上方，常驻不退场
 * 收起一行，运行中图标位随相位换身份图标加一句动向，圆点紧跟动向文字右侧
 * 空闲从消息流现算本轮摘要，成功绿对勾加执行了 N 个步骤，失败轮对勾消失整句红字
 * 点条本体完全展开，展开区是整个会话的过程记录，右缘箭头收到发丝线档
 * 时间线列表用 Virtuoso 虚拟化，长会话只渲染可视行，贴底跟随由 followOutput 承担
 */
export function LiveStrip() {
  const { t } = useTranslation();
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const liveRun = useChatStore((s) =>
    currentSessionId
      ? (s.sessionStates.get(currentSessionId)?.liveRun ?? null)
      : null
  );
  const messages = useChatStore((s) =>
    currentSessionId
      ? (s.sessionStates.get(currentSessionId)?.messages ?? EMPTY_MESSAGES)
      : EMPTY_MESSAGES
  );
  const [mode, setMode] = useState<StripMode>(lastMode);

  const running = !!liveRun;
  const rows = useMemo(() => buildRows(messages, liveRun), [messages, liveRun]);

  const applyMode = (next: StripMode) => {
    lastMode = next;
    if (next !== 'open') {
      persistMode(next);
    }
    setMode(next);
  };

  if (!liveRun && rows.length === 0) return null;

  if (mode === 'hair') {
    return (
      <div className="absolute inset-x-0 top-0 z-10">
        <HairSeam
          label={t('live.restore')}
          running={running}
          onRestore={() => applyMode('line')}
        />
      </div>
    );
  }

  const idle = running ? null : idleLabel(t, messages);
  // 一行档失败镜像：运行中最后一步已失败，顶条镜像同一句红字动向，不带失败标记
  const liveFailed = liveRun
    ? !!liveRun.steps[liveRun.steps.length - 1]?.failed
    : false;
  const label = liveRun
    ? liveRunLabel(t, liveRun)
    : (idle?.text ?? t('live.thinking'));
  const labelRed = liveRun ? liveFailed : (idle?.failed ?? false);
  const PhaseIcon = liveRun ? phaseIcon(liveRun) : null;
  const idleFailed = idle?.failed ?? false;

  return (
    <div className="absolute inset-x-0 top-0 z-10 bg-background/80 backdrop-blur-md border-b border-border">
      {/* 行档高 h-9 加边线 1px 共 37px，MessageList 顶部留白常量按此预留，两边调整需同步 */}
      <div className="flex h-9 items-stretch">
        <button
          type="button"
          onClick={() => applyMode(mode === 'open' ? 'line' : 'open')}
          aria-expanded={mode === 'open'}
          className="flex-1 min-w-0 flex items-center gap-2 px-4 hover:bg-muted/50 transition-colors"
        >
          {PhaseIcon ? (
            <PhaseIcon className="w-[13px] h-[13px] text-primary shrink-0" />
          ) : idleFailed ? null : (
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
          )}
          <span
            className={`min-w-0 text-left text-caption truncate ${
              labelRed
                ? 'font-semibold text-[#d5392e]'
                : 'font-medium text-foreground'
            }`}
          >
            {label}
          </span>
          {/* 圆点紧跟动向文字右侧，文字超长先收缩截断，圆点保持在省略号之后 */}
          {running && !liveFailed && <Dots />}
        </button>
        <button
          type="button"
          onClick={() => applyMode('hair')}
          aria-label={t('live.collapse')}
          className="flex items-center px-3 text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors"
        >
          <ChevronUp className="w-4 h-4" />
        </button>
      </div>
      <div
        className="relative overflow-hidden transition-[max-height] duration-300 ease-out"
        style={{ maxHeight: mode === 'open' ? PANEL_MAX_H : 0 }}
      >
        {/* Virtuoso 虚拟化长会话只渲染可视行，followOutput 负责贴底跟随与上翻不拽 */}
        <Virtuoso
          data={rows}
          itemContent={(_, row) => <TimelineRow row={row} />}
          followOutput="smooth"
          initialTopMostItemIndex={{ index: 'LAST', align: 'end' }}
          style={{ height: PANEL_MAX_H }}
          components={{ Header: ListTopPad, Footer: ListBottomPad }}
        />
        {mode === 'open' && rows.length > 0 && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-background to-transparent" />
        )}
      </div>
    </div>
  );
}

/**
 * 完全收起档的手柄胶囊，悬浮层不占布局，运行与空闲同长 84 乘 4 圆角 2 距 header 下缘 6px
 * 运行态胶囊即轨道，淡蓝底内有一条渐变光带循环扫动表达仍在运行
 * 空闲态同一胶囊换灰色静止，一眼是个能点的控件，两态不变尺寸
 * 热区背景透明全宽二十像素，消息从胶囊下方滚过，点按恢复留一行
 * @param label 无障碍标签
 * @param running 运行期标记，控制轨道颜色与光带
 * @param onRestore 点按恢复回调
 */
function HairSeam({
  label,
  running,
  onRestore,
}: {
  label: string;
  running: boolean;
  onRestore: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRestore}
      aria-label={label}
      className="block w-full relative h-5"
    >
      <span
        className={`absolute left-1/2 top-1.5 -translate-x-1/2 w-[84px] h-1 rounded-full overflow-hidden ${
          running ? 'bg-primary/15' : 'bg-muted-foreground/35'
        }`}
      >
        {running && (
          <span className="absolute left-0 top-0 h-full w-2/5 bg-gradient-to-r from-transparent via-primary to-transparent animate-hair-sweep" />
        )}
      </span>
    </button>
  );
}

/**
 * 时间线的单行，三类各自可辨，行本体可点
 * 前置位任何时候都是身份图标，运行行的圆点紧跟文字右侧对齐首行，失败行整句红字紧跟 circle-x
 * 三类行统一点开详情浮层，工具行看输入与输出，失败行浮层多错误区，用户行与思考行看全文
 * 运行中的行没有完整结果不可点，无原始数据的旧工具行回退行内参数标签
 * @param row 当前行数据
 */
function TimelineRow({ row }: { row: TimelineRowData }) {
  const { t } = useTranslation();
  const live = row.kind === 'user' ? false : (row.live ?? false);
  const [expanded, setExpanded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  const summary =
    row.kind === 'tool'
      ? stepPhrase(t, {
          tool: row.tool,
          detail: row.detail,
          startedAt: 0,
          endedAt: 1,
        })
      : '';
  const thinkText =
    row.kind === 'think' ? (row.synthetic ? t('live.thinking') : row.text) : '';
  // 详情载荷：用户行恒可看全文，思考行闭合才可看，工具行带原始数据才可看，失败行带标记进错误区
  const detail: RowDetail | null =
    row.kind === 'user'
      ? { kind: 'user', text: row.text }
      : row.kind === 'think'
        ? live
          ? null
          : { kind: 'think', text: row.text }
        : !live && row.input
          ? {
              kind: 'tool',
              tool: row.tool,
              summary,
              input: row.input,
              output: row.output,
              failed: row.failed,
            }
          : null;
  const legacyTool = row.kind === 'tool' && !live && !row.input;
  // 浮层与遮罩在 React 树上挂在本行之下，其点击会沿合成事件冒泡回来，目标不在行内的一律忽略
  const fromRow = (e: React.MouseEvent) =>
    e.currentTarget.contains(e.target as Node);
  const openDetail = () => {
    if (!detailOpen) setDetailOpen(true);
  };
  const affordance = detail ? (
    <ArrowUpRight className="ml-auto w-3 h-3 mt-1 text-muted-foreground/70 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity" />
  ) : legacyTool ? (
    <ChevronDown
      className={`ml-auto w-3 h-3 mt-1 text-muted-foreground/70 shrink-0 transition-transform ${
        expanded ? 'rotate-180' : ''
      }`}
    />
  ) : null;

  if (row.kind === 'user') {
    return (
      <div
        onClick={(e) => {
          if (!fromRow(e)) return;
          openDetail();
        }}
        className="flex items-start gap-2 px-4 py-1.5 cursor-pointer hover:bg-muted/40 transition-colors group/row"
      >
        <MessageSquare className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
        <span className="flex-1 min-w-0 text-caption text-muted-foreground line-clamp-2 group-hover/row:underline">
          {row.text}
        </span>
        {affordance}
        <RowDetailDialog
          detail={detail ?? { kind: 'user', text: row.text }}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      </div>
    );
  }

  if (row.kind === 'think') {
    return (
      <div
        onClick={
          live
            ? undefined
            : (e) => {
                if (!fromRow(e)) return;
                openDetail();
              }
        }
        className={`flex items-start gap-2 px-4 py-1.5 transition-colors group/row ${
          live ? '' : 'cursor-pointer hover:bg-muted/40'
        }`}
      >
        <Lightbulb className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
        <span
          className={`min-w-0 text-caption line-clamp-2 ${
            live
              ? 'text-foreground font-medium'
              : 'text-muted-foreground group-hover/row:underline'
          }`}
        >
          {thinkText}
        </span>
        {live && <Dots className="mt-[7px]" />}
        {affordance}
        {!live && (
          <RowDetailDialog
            detail={detail ?? { kind: 'think', text: row.text }}
            open={detailOpen}
            onOpenChange={setDetailOpen}
          />
        )}
      </div>
    );
  }

  // 工具行：带原始入参的完成行点开调用详情浮层，失败行浮层多错误区，运行行与缺数据的旧行保持轻交互
  const canDetail = !live && !!row.input;
  const Icon = toolIcon(row.tool);
  return (
    <div
      onClick={
        live
          ? undefined
          : canDetail
            ? (e) => {
                if (!fromRow(e)) return;
                openDetail();
              }
            : (e) => {
                if (!fromRow(e)) return;
                setExpanded((v) => !v);
              }
      }
      className={`flex items-start gap-2 px-4 py-1.5 transition-colors group/row ${
        live ? '' : 'cursor-pointer hover:bg-muted/40'
      }`}
    >
      <Icon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
      {row.failed ? (
        // 失败行主文字不撑满整行，标记贴着文字尾部
        <div className="flex-1 min-w-0 flex items-start gap-2">
          <span className="min-w-0 text-caption text-[#d5392e]">{summary}</span>
          <XCircle className="w-[13px] h-[13px] mt-px text-[#d5392e] shrink-0" />
        </div>
      ) : (
        <div className="min-w-0">
          <span
            className={`block text-caption ${
              live ? 'text-foreground font-medium' : 'text-muted-foreground'
            } ${canDetail ? 'group-hover/row:underline' : ''}`}
          >
            {summary}
          </span>
          {!canDetail && expanded && row.detail && (
            <code className="mt-1 w-fit block text-micro text-primary bg-primary/10 rounded px-2 py-0.5 font-mono break-all">
              {row.tool} · {row.detail}
            </code>
          )}
        </div>
      )}
      {live && !row.failed && <Dots className="mt-[7px]" />}
      {affordance}
      {canDetail && row.input && (
        <RowDetailDialog
          detail={{
            kind: 'tool',
            tool: row.tool,
            summary,
            input: row.input,
            output: row.output,
            failed: row.failed,
          }}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      )}
    </div>
  );
}
