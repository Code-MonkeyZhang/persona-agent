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
  MessageCircle,
  MessageSquare,
  MessageSquareDashed,
  Minimize2,
  Pencil,
  Smile,
  TerminalSquare,
  Wrench,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { shortToolName, stepPhrase, summarizeToolInput } from '@persona/shared';
import type { CompressionRecord } from '@persona/shared';
import { userRowLabel } from '../../lib/attachments';
import { logger } from '../../lib/logger';
import { formatK } from '../../lib/utils';
import { useChatStore } from '../../stores/chatStore';
import type { CompressionRuntimeState } from '../../stores/chatStore';
import type { GeneratingPhase } from '../../stores/performanceEngine';
import { RowDetailDialog, type RowDetail } from './RowDetailDialog';
import type { Thought, UIMessage } from '../../types/chat';

/** 实时步骤条的一步，tool 为空串代表文字步，detail 是参数摘要或文字步正文
 *  input 与 output 是工具步的原始入参与原始输出 JSON 字符串，供详情浮层消费
 *  text 标记模型文字步，渲染时按后面跟不跟工具分中间解说行与回复内容行
 *  toolTitle 是模型自写的调用短标题，显示取值链第一优先
 *  iconUrl 是 MCP 工具所属服务的 logo 图址，缺失回退 Wrench
 *  failed 标记工具步失败，行渲染走红字加 circle-x，错误明细只进详情浮层 */
export interface LiveStep {
  tool: string;
  detail: string;
  startedAt: number;
  endedAt?: number;
  input?: string;
  output?: string;
  text?: boolean;
  toolTitle?: string;
  iconUrl?: string;
  failed?: boolean;
}

/** 回合运行期的实时状态，null 表示空闲，顶条与时间线据此渲染活动尾巴
 *  replying 标记模型正在产出正文，content_started 到达置位，步落行后复位 */
export interface LiveRunState {
  steps: LiveStep[];
  replying?: boolean;
}

/** 工具名到行前置位身份图标的映射，内置工具全量登记，未登记的第三方工具回退扳手 */
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
 * 全名先剥条目前缀再查表，MCP 工具的身份由 iconUrl 图址承担，这里只兜无图址的展示位
 * @param tool 工具实名
 */
export function toolIcon(tool: string): LucideIcon {
  return TOOL_ICONS[shortToolName(tool)] ?? Wrench;
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
    toolTitle: thought.toolTitle,
  });
}

/**
 * 取最后一个未闭合的工具步，没有则返回 undefined
 * 未闭合的步只可能是工具步，文字步落行时就带结束时间
 * @param liveRun 当前回合的实时状态
 */
export function activeToolStep(liveRun: LiveRunState): LiveStep | undefined {
  return [...liveRun.steps]
    .reverse()
    .find((s) => s.tool !== '' && s.endedAt === undefined);
}

/**
 * 状态条当前动作文案推导，三态纯函数，有未闭合工具步则工具执行叙述，
 * 无活动步且正文写作中返回正在回复，其余思考中
 * @param t 文案函数
 * @param liveRun 当前回合的实时状态
 */
export function liveRunLabel(
  t: (key: string) => string,
  liveRun: LiveRunState
): string {
  const active = activeToolStep(liveRun);
  if (active) return stepPhrase(t, active);
  return liveRun.replying ? t('live.replying') : t('live.thinking');
}

/**
 * 顶条图标位随相位换身份图标，三态纯函数，活动工具步取工具身份，
 * 正文写作中取方形气泡，其余灯泡
 * @param liveRun 当前回合的实时状态
 */
export function phaseIcon(liveRun: LiveRunState): LucideIcon {
  const active = activeToolStep(liveRun);
  if (active) return toolIcon(active.tool);
  return liveRun.replying ? MessageSquare : Lightbulb;
}

/**
 * 从实时状态推出陪伴舞台的生成相位，思考气泡据此出入场，与顶条的文案和图标同出一份推导
 * 有未闭合的工具步是 tool，带写作标志是 replying，其余 thinking，空闲传 null
 * @param liveRun 当前回合的实时状态，空闲传 null
 */
export function deriveLivePhase(liveRun: LiveRunState | null): GeneratingPhase {
  if (!liveRun) return 'idle';
  if (activeToolStep(liveRun)) return 'tool';
  return liveRun.replying ? 'replying' : 'thinking';
}

/** 展开区时间线的高度上限，超出内部滚动 */
const PANEL_MAX_H = 288;

/** messages 选择器的稳定空数组，避免每次快照新建引用触发多余渲染 */
const EMPTY_MESSAGES: UIMessage[] = [];

/** 压缩记录选择器的稳定空数组，同 EMPTY_MESSAGES 的约定 */
const EMPTY_RECORDS: CompressionRecord[] = [];

/** 运行指示的三颗呼吸圆点，紧跟文字右侧由行 gap 提供间距，主色 4px 单颗 1.2s 相位各差 0.2s，导出供陪伴气泡动向行复用 */
export function Dots({ className = '' }: { className?: string }) {
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

/** 时间线行数据，kind 区分六类条目，live 标记运行期未闭合的活动行
 *  synthetic 标记思考间隙与写作期补出的活动行，文本渲染时取文案不存值
 *  note 是模型中间解说，reply 是回复内容，工具行带原始数据供详情浮层消费
 *  compress 是压缩记录行，一次压缩一条随会话持久化 */
export type TimelineRowData =
  | { kind: 'user'; text: string }
  | { kind: 'think'; text: string; live?: boolean; synthetic?: boolean }
  | { kind: 'note'; text: string }
  | { kind: 'reply'; text: string; live?: boolean; synthetic?: boolean }
  | {
      kind: 'tool';
      tool: string;
      detail: string;
      toolTitle?: string;
      iconUrl?: string;
      live?: boolean;
      failed?: boolean;
      input?: string;
      output?: string;
    }
  | { kind: 'compress'; record: CompressionRecord };

/**
 * 把会话消息流摊平成时间线行，顺序即发生顺序
 * 用户消息出用户行，assistant 消息思考段出思考行，工具调用出工具行带参数摘要
 * 落盘消息的中间解说轮末收起不进行，正文非空出回复内容行给整轮收尾
 * 落盘行与运行行的失败判定同源，读 thought 的 isError 与 toolResult 的 isError
 * 历史压缩记录按落库时刻插进消息序列，晚于全部消息的记录接在尾部
 * 运行中的压缩记录固定在尾，meta 未带到时由运行态合成一行补位
 * 运行期 liveRun 的步骤作为活动尾巴接在末尾，当前轮的消息还没落盘由它补齐
 * 文字步按后面跟不跟工具定性，跟了出中间解说行，没跟出回复内容行
 * 运行中没有未闭合工具步时按相位补活动行，写作期补正在回复标记，间隙补思考中
 * @param messages 当前会话消息流
 * @param liveRun 运行期实时状态，空闲传 null
 * @param compressionRecords 压缩记录清单，按发生时间升序，无记录传空
 * @param compressionRuntime 压缩运行态，空闲传 null
 */
export function buildRows(
  messages: UIMessage[],
  liveRun: LiveRunState | null,
  compressionRecords: CompressionRecord[] = [],
  compressionRuntime: CompressionRuntimeState | null = null
): TimelineRowData[] {
  const rows: TimelineRowData[] = [];
  // 运行中记录不按时间插入，与合成行一起固定在尾
  const pending = compressionRecords.filter((r) => r.state !== 'running');
  let pendingIndex = 0;
  const flushDueRecords = (before: number) => {
    while (
      pendingIndex < pending.length &&
      pending[pendingIndex].at <= before
    ) {
      rows.push({ kind: 'compress', record: pending[pendingIndex] });
      pendingIndex++;
    }
  };
  for (const m of messages) {
    flushDueRecords(m.timestamp.getTime());
    if (m.type === 'user') {
      rows.push({
        kind: 'user',
        text: userRowLabel(m.content, m.attachments),
      });
      continue;
    }
    for (const th of m.thoughts ?? []) {
      if (th.type === 'tool_use') {
        rows.push({
          kind: 'tool',
          tool: th.toolName ?? '',
          detail: summarizeToolInput(th.toolName ?? '', th.toolInput),
          toolTitle: th.toolTitle,
          iconUrl: th.iconUrl,
          failed: th.isError || th.toolResult?.isError || undefined,
          input: th.toolInput ? JSON.stringify(th.toolInput) : undefined,
          output: th.toolResult?.output,
        });
      } else if (th.type === 'thinking' && th.content) {
        rows.push({ kind: 'think', text: th.content });
      }
    }
    if (m.content) {
      rows.push({ kind: 'reply', text: m.content });
    }
  }
  // 晚于全部消息的历史记录接在消息行之后，当前回合的运行行之前
  while (pendingIndex < pending.length) {
    rows.push({ kind: 'compress', record: pending[pendingIndex] });
    pendingIndex++;
  }
  if (liveRun) {
    liveRun.steps.forEach((st, i) => {
      const live = st.endedAt === undefined;
      if (st.tool === '') {
        if (st.text) {
          // 文字定性纯推导，后面还有工具步即中间解说，否则是候选的回复内容
          const hasToolAfter = liveRun.steps
            .slice(i + 1)
            .some((s) => s.tool !== '');
          rows.push(
            hasToolAfter
              ? { kind: 'note', text: st.detail }
              : { kind: 'reply', text: st.detail }
          );
        } else {
          rows.push({ kind: 'think', text: st.detail, live });
        }
      } else {
        rows.push({
          kind: 'tool',
          tool: st.tool,
          detail: st.detail,
          toolTitle: st.toolTitle,
          iconUrl: st.iconUrl,
          live,
          failed: st.failed,
          input: st.input,
          output: st.output,
        });
      }
    });
    if (!liveRun.steps.some((s) => s.tool !== '' && s.endedAt === undefined)) {
      rows.push(
        liveRun.replying
          ? { kind: 'reply', text: '', live: true, synthetic: true }
          : { kind: 'think', text: '', live: true, synthetic: true }
      );
    }
  }
  // 运行中的压缩行压轴，meta 已带同 id 记录时合成行让位
  const runningRecords = compressionRecords.filter(
    (r) => r.state === 'running'
  );
  for (const r of runningRecords) {
    rows.push({ kind: 'compress', record: r });
  }
  if (
    compressionRuntime &&
    (compressionRuntime.phase === 'running' ||
      compressionRuntime.phase === 'retry') &&
    !runningRecords.some((r) => r.id === compressionRuntime.recordId)
  ) {
    rows.push({
      kind: 'compress',
      // 合成记录的 trigger 与 at 不参与渲染，仅满足记录类型，meta 同步后由真实记录顶替
      record: {
        id: compressionRuntime.recordId,
        state: 'running',
        trigger: 'manual',
        attempt: compressionRuntime.attempt,
        before: null,
        after: null,
        at: Date.now(),
      },
    });
  }
  return rows;
}

/** i18n 文案函数的最小形状，供纯函数与测试共用 */
export type Translate = (key: string, opts?: Record<string, unknown>) => string;

/**
 * 空闲态一行档摘要，从最后一条带工具步的 assistant 消息现算步数与失败步数
 * 失败轮红字优先，消息流尾部是 error 消息即本轮失败，有失败步数报 doneFail，
 * 零步骤失败轮同样落 roundFail，不回退已回复，对勾不出现
 * 成功轮优先显示模型写的本轮意图，取最后一个工具步的 toolIntent，未写走步数兜底
 * 零工具步的轮与回退不到任何 assistant 轮的空窗都显示已回复，用户消息原文不上单行
 * @param t 文案函数
 * @param messages 当前会话消息流
 */
export function idleLabel(
  t: Translate,
  messages: UIMessage[]
): { text: string; failed: boolean } {
  const errTail = messages[messages.length - 1]?.type === 'error';
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.type !== 'assistant' || !m.thoughts?.length) continue;
    const tools = m.thoughts.filter((th) => th.type === 'tool_use');
    const fails = tools.filter(
      (th) => th.isError || th.toolResult?.isError
    ).length;
    if (fails > 0) {
      return {
        text: t('live.doneFail', { count: tools.length, fails }),
        failed: true,
      };
    }
    if (errTail) {
      return { text: t('live.roundFail'), failed: true };
    }
    if (tools.length === 0) {
      return { text: t('live.replied'), failed: false };
    }
    const intent = tools[tools.length - 1]?.toolIntent;
    return intent
      ? { text: intent, failed: false }
      : { text: t('live.done', { count: tools.length }), failed: false };
  }
  if (errTail) {
    return { text: t('live.roundFail'), failed: true };
  }
  return { text: t('live.replied'), failed: false };
}

/** 顶条压缩相位的显示形状，mono 是等宽字附注，重试序号或落定对比 */
interface CompressionPhaseView {
  icon: LucideIcon;
  label: string;
  mono: string | null;
  dots: boolean;
  failed: boolean;
}

/**
 * 顶条压缩相位显示，运行与重试带圆点与序号，落定亮出前后对比
 * 失败与真底线同为终态上单行，红字换 XCircle 与时间线压缩行同色
 * 中断不进运行态，只在时间线压缩行灰字悬置
 * @param t 文案函数
 * @param state 压缩运行态，空闲无落定记忆返回 null
 */
function compressionPhase(
  t: Translate,
  state: CompressionRuntimeState | null
): CompressionPhaseView | null {
  if (!state) return null;
  if (state.phase === 'running') {
    return {
      icon: Minimize2,
      label: t('live.compressionRunning'),
      mono: null,
      dots: true,
      failed: false,
    };
  }
  if (state.phase === 'retry') {
    return {
      icon: Minimize2,
      label: t('live.compressionRetrying'),
      mono: `(${state.attempt}/3)`,
      dots: true,
      failed: false,
    };
  }
  if (state.phase === 'failed') {
    return {
      icon: XCircle,
      label:
        state.failReason === 'no_material'
          ? t('live.compressionFloorEmpty')
          : t('live.compressionFailed'),
      mono: null,
      dots: false,
      failed: true,
    };
  }
  const landed = state.lastLanded;
  if (!landed) return null;
  const mono =
    landed.before != null && landed.after != null
      ? `${formatK(landed.before)} → ${formatK(landed.after)}`
      : null;
  return {
    icon: Minimize2,
    label: t('live.compressionCompacted'),
    mono,
    dots: false,
    failed: false,
  };
}

/**
 * 最新 complete 记录携带的当前摘要，任何落定行点开看到的都是它
 * @param records 压缩记录清单
 */
function currentSummary(records: CompressionRecord[]): string | null {
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (r.state === 'complete' && r.summary) return r.summary;
  }
  return null;
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
 * 模型运行态优先于压缩反馈，压缩相位显示中不被本轮失败抢占
 * 点条本体完全展开，展开区是整个会话的过程记录，右缘箭头收到发丝线档
 * 时间线列表用 Virtuoso 虚拟化，长会话只渲染可视行，贴底跟随由 followOutput 承担
 * 展开区高度取内容实测高与上限的较小值，内容少自动收矮，超过上限内部滚动
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
  const compressionState = useChatStore((s) =>
    currentSessionId
      ? (s.compressionStates.get(currentSessionId) ?? null)
      : null
  );
  const compressionRecords = useChatStore((s) =>
    currentSessionId
      ? (s.compressionLogs.get(currentSessionId) ?? EMPTY_RECORDS)
      : EMPTY_RECORDS
  );
  const [mode, setMode] = useState<StripMode>(lastMode);
  const [panelContentH, setPanelContentH] = useState(0);

  const running = !!liveRun;
  const rows = useMemo(
    () => buildRows(messages, liveRun, compressionRecords, compressionState),
    [messages, liveRun, compressionRecords, compressionState]
  );

  const applyMode = (next: StripMode) => {
    lastMode = next;
    if (next !== 'open') {
      persistMode(next);
    }
    setMode(next);
  };

  // 展开区高度取内容实测高与上限的较小值，实测未达时回落上限，短内容自动收矮
  const cappedPanelH =
    panelContentH > 0 ? Math.min(panelContentH, PANEL_MAX_H) : PANEL_MAX_H;

  // Virtuoso 上报内容总高驱动收矮，值变化时记一条日志便于排查高度问题
  const onPanelContentH = (h: number) => {
    logger.info('LiveStrip', 'panel content height', h);
    setPanelContentH(h);
  };

  if (!liveRun && rows.length === 0) return null;

  // 压缩相位显示，模型运行态优先让位，让位后不复活直到下一次压缩落定
  const comp = running ? null : compressionPhase(t, compressionState);

  if (mode === 'hair') {
    return (
      <div className="absolute inset-x-0 top-0 z-10">
        <HairSeam
          label={t('live.restore')}
          running={running || !!comp?.dots}
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
    : comp
      ? comp.label
      : (idle?.text ?? t('live.thinking'));
  const labelRed = liveRun
    ? liveFailed
    : comp
      ? comp.failed
      : (idle?.failed ?? false);
  const PhaseIcon = liveRun ? phaseIcon(liveRun) : (comp?.icon ?? null);
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
            <PhaseIcon
              className={`w-[13px] h-[13px] shrink-0 ${
                comp?.failed ? 'text-[#d5392e]' : 'text-primary'
              }`}
            />
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
            {comp?.mono && (
              <span className="ml-1 font-mono tabular-nums">{comp.mono}</span>
            )}
          </span>
          {/* 圆点紧跟动向文字右侧，文字超长先收缩截断，圆点保持在省略号之后 */}
          {(running && !liveFailed) || comp?.dots ? <Dots /> : null}
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
        style={{ maxHeight: mode === 'open' ? cappedPanelH : 0 }}
      >
        {/* Virtuoso 虚拟化长会话只渲染可视行，followOutput 负责贴底跟随与上翻不拽，totalListHeightChanged 上报内容总高驱动收矮 */}
        <Virtuoso
          data={rows}
          itemContent={(_, row) => <TimelineRow row={row} />}
          followOutput="smooth"
          initialTopMostItemIndex={{ index: 'LAST', align: 'end' }}
          style={{ height: cappedPanelH }}
          components={{ Header: ListTopPad, Footer: ListBottomPad }}
          totalListHeightChanged={onPanelContentH}
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

/** 工具行的行数据形状，供前置位组件收窄消费 */
type ToolRow = Extract<TimelineRowData, { kind: 'tool' }>;

/** 工具行前置位，MCP 工具显所属服务 logo，图址缺失或加载失败回退身份图标 */
function ToolLeadingIcon({ row }: { row: ToolRow }) {
  const [logoFailed, setLogoFailed] = useState(false);
  if (row.iconUrl && !logoFailed) {
    return (
      <img
        src={row.iconUrl}
        alt=""
        className="w-3.5 h-3.5 mt-0.5 shrink-0 object-contain"
        onError={() => setLogoFailed(true)}
      />
    );
  }
  const Icon = toolIcon(row.tool);
  return <Icon className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />;
}

/**
 * 时间线的压缩行，一次压缩一条记录随会话持久化
 * 运行与重试带呼吸圆点，重试附等宽序号，完成转灰带前后对比并可点开当前摘要
 * 真底线与失败整句红字换 XCircle，中断灰字兜悬置运行态，前后数字缺失不出对比
 * @param record 压缩记录
 */
function CompressionRow({ record }: { record: CompressionRecord }) {
  const { t } = useTranslation();
  // 落定行点开看到的都是当前生效的那一份摘要，取最新 complete 记录
  const summaryText = useChatStore((s) => {
    const sid = s.currentSessionId;
    return sid ? currentSummary(s.compressionLogs.get(sid) ?? []) : null;
  });
  const [detailOpen, setDetailOpen] = useState(false);

  const live = record.state === 'running';
  const retrying = live && record.attempt > 1;
  const floor = record.state === 'failed' && record.reason === 'no_material';
  const red = record.state === 'failed';
  const landed = record.state === 'complete';
  const label = live
    ? retrying
      ? t('live.compressionRetrying')
      : t('live.compressionRunning')
    : landed
      ? t('live.compressionCompacted')
      : floor
        ? t('live.compressionFloorEmpty')
        : record.state === 'failed'
          ? t('live.compressionFailed')
          : t('live.compressionUnfinished');
  const mono =
    record.before != null && record.after != null
      ? `${formatK(record.before)} → ${formatK(record.after)}`
      : null;
  const canSummary = landed && summaryText != null;
  // 浮层挂在本行之下，其点击会沿合成事件冒泡回来，目标不在行内的一律忽略
  const fromRow = (e: React.MouseEvent) =>
    e.currentTarget.contains(e.target as Node);

  return (
    <div
      onClick={
        canSummary
          ? (e) => {
              if (!fromRow(e)) return;
              if (!detailOpen) setDetailOpen(true);
            }
          : undefined
      }
      className={`flex items-start gap-2 px-4 py-1.5 transition-colors group/row ${
        canSummary ? 'cursor-pointer hover:bg-muted/40' : ''
      }`}
    >
      {red ? (
        <XCircle className="w-3.5 h-3.5 mt-0.5 text-[#d5392e] shrink-0" />
      ) : (
        <Minimize2
          className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
            live ? 'text-primary' : 'text-muted-foreground'
          }`}
        />
      )}
      <span
        className={`min-w-0 text-caption leading-relaxed line-clamp-2 ${
          red
            ? 'text-[#d5392e]'
            : live
              ? 'text-foreground font-medium'
              : 'text-muted-foreground'
        } ${canSummary ? 'group-hover/row:underline' : ''}`}
      >
        {label}
        {retrying && (
          <span className="ml-1 font-mono tabular-nums">
            ({record.attempt}/3)
          </span>
        )}
        {landed && mono && (
          <span className="ml-1 font-mono tabular-nums">{mono}</span>
        )}
      </span>
      {live && <Dots className="mt-[7px]" />}
      {canSummary && (
        <>
          <ArrowUpRight className="ml-auto w-3 h-3 mt-1 text-muted-foreground/70 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity" />
          <RowDetailDialog
            detail={{ kind: 'summary', text: summaryText }}
            open={detailOpen}
            onOpenChange={setDetailOpen}
          />
        </>
      )}
    </div>
  );
}

/**
 * 时间线的单行，六类各自可辨，行本体可点
 * 前置位任何时候都是身份图标，运行行的圆点紧跟文字右侧对齐首行，失败行整句红字紧跟 circle-x
 * 行统一点开详情浮层，工具行看输入与输出，失败行浮层多错误区，文字类行看全文
 * 运行中的行没有完整结果不可点，无原始数据的旧工具行回退行内参数标签
 * @param row 当前行数据
 */
function TimelineRow({ row }: { row: TimelineRowData }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);

  // 压缩行换组件渲染，渲染所需全部在记录载荷里
  if (row.kind === 'compress') {
    return <CompressionRow record={row.record} />;
  }

  const live =
    row.kind === 'user' || row.kind === 'note' ? false : (row.live ?? false);

  const summary =
    row.kind === 'tool'
      ? stepPhrase(t, {
          tool: row.tool,
          detail: row.detail,
          toolTitle: row.toolTitle,
          startedAt: 0,
          endedAt: 1,
        })
      : '';
  const thinkText =
    row.kind === 'think' ? (row.synthetic ? t('live.thinking') : row.text) : '';
  // 详情载荷：用户行与解说行恒可看全文，思考行与回复行闭合才可看，工具行带原始数据才可看，失败行带标记进错误区
  let detail: RowDetail | null = null;
  if (row.kind === 'user') {
    detail = { kind: 'user', text: row.text };
  } else if (row.kind === 'think') {
    detail = live ? null : { kind: 'think', text: row.text };
  } else if (row.kind === 'note') {
    detail = { kind: 'note', text: row.text };
  } else if (row.kind === 'reply') {
    detail = live ? null : { kind: 'reply', text: row.text };
  } else if (!live && row.input) {
    detail = {
      kind: 'tool',
      tool: row.tool,
      summary,
      input: row.input,
      output: row.output,
      failed: row.failed,
    };
  }
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
        <MessageCircle className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
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

  // 解说行与回复行共用一套文字行渲染，写作期标记行取固定文案与主色图标，闭合行点开看全文
  if (row.kind === 'note' || row.kind === 'reply') {
    const TextIcon = row.kind === 'note' ? MessageSquareDashed : MessageSquare;
    const rowText =
      row.kind === 'reply' && row.synthetic ? t('live.replying') : row.text;
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
        <TextIcon
          className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
            live ? 'text-primary' : 'text-muted-foreground'
          }`}
        />
        <span
          className={`min-w-0 text-caption line-clamp-2 ${
            live
              ? 'text-foreground font-medium'
              : 'text-muted-foreground group-hover/row:underline'
          }`}
        >
          {rowText}
        </span>
        {live && <Dots className="mt-[7px]" />}
        {affordance}
        {!live && (
          <RowDetailDialog
            detail={detail ?? { kind: row.kind, text: row.text }}
            open={detailOpen}
            onOpenChange={setDetailOpen}
          />
        )}
      </div>
    );
  }

  // 工具行：带原始入参的完成行点开调用详情浮层，失败行浮层多错误区，运行行与缺数据的旧行保持轻交互
  const canDetail = !live && !!row.input;
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
      <ToolLeadingIcon row={row} />
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
