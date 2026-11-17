/**
 * @file src/renderer/components/chat/ContextUsageShell.tsx
 * @description 输入框工具行的上下文占用小壳
 *
 * 壳形 52 乘 20 描边圆角，低透明色底按占用宽度铺开，百分比数字居中，
 * 色阶三档随占用走高。快照缺失时整壳降级图标壳，保留点按手动压缩的入口。
 * 悬停浮出占用面板，头行用量、分段横条、图例与自动压缩状态点，
 * 壳与面板之间留垫高层桥接防移入闪烁。点按触发手动压缩，压缩全程禁点，
 * 数字与色底让位给居中转圈当作回执，转圈由压缩状态驱动跟随全程，
 * 终态失败换红色感叹号停留三秒再翻回数字。占用数字跨整数边界的变动走 600
 * 毫秒匀速补间，取整同数的微变直接落定，文案恒整数，
 * 悬停面板的分段横条与头行数字吃同一个过渡。
 */

import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Minimize2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { animate } from 'framer-motion';
import type { BreakdownShares } from '@persona/shared';
import { cn, formatK, getErrorMessage } from '../../lib/utils';
import { triggerCompression } from '../../lib/api';
import { logger } from '../../lib/logger';
import { toast } from '../../stores/toastStore';
import { useChatStore } from '../../stores/chatStore';
import { useConfigStore } from '../../stores/configStore';

/** 占用数字回落的补间时长毫秒，涨落双向同款 */
const TWEEN_MS = 600;

/** 失败红色感叹号在小壳上的停留时长毫秒，到点翻回数字 */
const FAIL_MARK_MS = 3000;

/**
 * 判断两个占用数字取整后是否同一百分比，供补间跳过判定。
 *
 * 同数直接落定不播动画，低于一个百分点的微涨微落在画面上无感，
 * 也消除静止整数与补间小数两种口径切换造成的起止位置跳变。
 */
export function sameRoundedPercent(
  from: number,
  to: number,
  windowSize: number
): boolean {
  if (windowSize <= 0) return true;
  return (
    Math.round((from / windowSize) * 100) ===
    Math.round((to / windowSize) * 100)
  );
}

/** 色阶三档，九成及以上红，七成到九成琥珀，其余主题主色 */
function toneClass(percent: number, kind: 'text' | 'bg'): string {
  if (percent >= 90) return kind === 'text' ? 'text-red-500' : 'bg-red-500';
  if (percent >= 70) return kind === 'text' ? 'text-amber-500' : 'bg-amber-500';
  return kind === 'text' ? 'text-primary' : 'bg-primary';
}

/** 面板分段的显示形状，key 供图例取文案，pct 为占整个上下文窗口的百分数 */
interface UsageSegment {
  key: keyof BreakdownShares;
  pct: number;
}

/** 分段名到 i18n 键的映射，静态键保证 i18n 校验可扫 */
const SEGMENT_LABELS: Record<keyof BreakdownShares, string> = {
  messages: 'inputBox.srcMessages',
  systemPersona: 'inputBox.srcSystemPersona',
  toolsSkills: 'inputBox.srcToolsSkills',
};

/** 分段横条的明暗阶梯，按占比降序配档 */
const SEGMENT_TONES = ['bg-primary', 'bg-primary/75', 'bg-primary/50'];

/**
 * 三段按估算构成瓜分真实总占用，降序配档，真实报数定总量，估算定构成。
 * 各段 pct 口径为占整个上下文窗口的份额，三段合计锚定总占用取整值，
 * 取整走最大余数法把零头按小数部分大者补回，兜住逐项四舍五入的合计漂移。
 * 总量为零时返回空数组由横条降级单段。
 */
export function buildSegments(
  shares: BreakdownShares,
  pctRaw: number
): UsageSegment[] {
  const entries: Array<{ key: keyof BreakdownShares; value: number }> = [
    { key: 'messages', value: shares.messages },
    { key: 'systemPersona', value: shares.systemPersona },
    { key: 'toolsSkills', value: shares.toolsSkills },
  ];
  const total = entries.reduce((sum, e) => sum + e.value, 0);
  if (total <= 0) return [];
  const sorted = entries.sort((a, b) => b.value - a.value);
  const target = Math.round(pctRaw);
  const raws = sorted.map((e) => (e.value / total) * target);
  const floors = raws.map((raw) => Math.floor(raw));
  raws
    .map((raw, i) => ({ i, frac: raw - Math.floor(raw) }))
    .sort((a, b) => b.frac - a.frac)
    .slice(0, target - floors.reduce((sum, v) => sum + v, 0))
    .forEach(({ i }) => {
      floors[i] += 1;
    });
  return sorted.map((e, i) => ({ key: e.key, pct: floors[i] }));
}

/** 占用面板，头行用量、分段横条、图例与自动压缩状态点 */
function UsagePanel({
  used,
  windowSize,
  pctRaw,
  pctLabel,
  shares,
  autoCompress,
}: {
  used: number;
  windowSize: number;
  pctRaw: number;
  pctLabel: string;
  shares: BreakdownShares | null;
  autoCompress: boolean;
}) {
  const { t } = useTranslation();
  const segments = shares ? buildSegments(shares, pctRaw) : [];
  return (
    <div className="flex w-[300px] flex-col gap-2.5 rounded-xl border border-border bg-background p-3.5 text-left shadow-lg">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-caption font-medium text-foreground">
          {t('inputBox.contextUsage')}
        </span>
        <span className="font-mono text-caption tabular-nums text-muted-foreground">
          {formatK(used)}/{Math.round(windowSize / 1000)}k ({pctLabel}%)
        </span>
      </div>
      <div className="flex h-2 overflow-hidden rounded-full bg-muted">
        {segments.length > 0 ? (
          segments.map((seg, i) => (
            <span
              key={seg.key}
              className={cn('h-full min-w-[2px]', SEGMENT_TONES[i])}
              style={{ width: `${seg.pct}%` }}
            />
          ))
        ) : (
          <span
            className="h-full bg-primary"
            style={{ width: `${Math.min(100, pctRaw)}%` }}
          />
        )}
      </div>
      {segments.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {segments.map((seg, i) => (
            <div
              key={seg.key}
              className="flex items-center gap-2 text-caption text-muted-foreground"
            >
              <span
                className={cn(
                  'h-2 w-2 shrink-0 rounded-[2.5px] border border-border',
                  SEGMENT_TONES[i]
                )}
              />
              <span>{t(SEGMENT_LABELS[seg.key])}</span>
              <span className="ml-auto font-mono tabular-nums text-foreground/80">
                {seg.pct}%
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2 border-t border-border pt-2 text-caption text-foreground">
        <span
          className={cn(
            'h-1.5 w-1.5 shrink-0 rounded-full',
            autoCompress ? 'bg-primary' : 'bg-muted-foreground/40'
          )}
          aria-hidden
        />
        <span>{t(autoCompress ? 'inputBox.autoOn' : 'inputBox.autoOff')}</span>
      </div>
    </div>
  );
}

/**
 * 上下文占用小壳，挂在输入框工具行左组，读当前会话的占用快照与压缩运行态。
 * 数字缺失降级图标壳，未选中会话时整壳隐藏。
 */
export function ContextUsageShell() {
  const { t } = useTranslation();
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const agentId = useChatStore((s) => s.agentId);
  const snapshot = useChatStore((s) =>
    currentSessionId ? (s.usageSnapshots.get(currentSessionId) ?? null) : null
  );
  const compression = useChatStore((s) =>
    currentSessionId
      ? (s.compressionStates.get(currentSessionId) ?? null)
      : null
  );
  const autoCompress = useConfigStore(
    (s) => s.config?.compression.autoCompress ?? true
  );

  const hasUsage = snapshot != null && snapshot.window > 0;
  const target = hasUsage && snapshot ? snapshot.used : null;

  const [display, setDisplay] = useState<number | null>(null);
  const displayRef = useRef<number | null>(null);
  const sessionRef = useRef<string | null>(null);
  const windowSize = hasUsage && snapshot ? snapshot.window : 0;

  useEffect(() => {
    if (target == null) return;
    // 会话切换直落数字不走补间，同会话的报数变化走匀速补间
    if (sessionRef.current !== currentSessionId) {
      sessionRef.current = currentSessionId;
      displayRef.current = target;
      setDisplay(target);
      return;
    }
    const from = displayRef.current;
    // 取整后同百分比直接落定，微涨微落不播动画也避免起止位置跳变
    if (
      from == null ||
      from === target ||
      sameRoundedPercent(from, target, windowSize)
    ) {
      displayRef.current = target;
      setDisplay(target);
      return;
    }
    const controls = animate(from, target, {
      duration: TWEEN_MS / 1000,
      ease: 'linear',
      onUpdate: (v) => {
        displayRef.current = v;
        setDisplay(v);
      },
      onComplete: () => {
        displayRef.current = target;
        setDisplay(target);
      },
    });
    return () => controls.stop();
  }, [currentSessionId, target, windowSize]);

  const compressing =
    compression?.phase === 'running' || compression?.phase === 'retry';
  const failedAt = compression?.failedAt ?? null;

  // 失败回执由 failedAt 时间戳驱动，亮三秒红色感叹号后翻回数字
  // 过期时间戳不亮，防会话切换或重挂载撞上旧回执
  const [failVisible, setFailVisible] = useState(false);
  useEffect(() => {
    if (failedAt == null || Date.now() - failedAt > FAIL_MARK_MS) {
      setFailVisible(false);
      return;
    }
    setFailVisible(true);
    logger.info('Compression fail mark shown', { failedAt });
    const id = setTimeout(
      () => setFailVisible(false),
      FAIL_MARK_MS - (Date.now() - failedAt)
    );
    return () => clearTimeout(id);
  }, [failedAt]);

  const shown = hasUsage ? (display ?? target) : null;
  const pctRaw =
    shown != null && snapshot ? (shown / snapshot.window) * 100 : 0;
  // 文案恒整数，补间只作用于底层数值与色底，跨过整数边界那帧进位一次
  const pctLabel = String(Math.round(pctRaw));

  if (!currentSessionId) return null;

  const compressNow = async () => {
    if (!agentId || !currentSessionId || compressing) return;
    try {
      await triggerCompression(agentId, currentSessionId);
      logger.info('Manual compression triggered', {
        sessionId: currentSessionId,
      });
    } catch (err) {
      logger.warn('Manual compression failed', {
        sessionId: currentSessionId,
        error: getErrorMessage(err),
      });
      toast.error(t('inputBox.compressFailed'));
    }
  };

  return (
    <div className="group/shell relative flex items-center">
      <button
        type="button"
        onClick={compressNow}
        disabled={compressing}
        title={t('inputBox.compressAction')}
        className="flex h-8 w-[64px] cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-muted disabled:cursor-default"
      >
        <span className="relative flex h-5 w-[52px] items-center justify-center overflow-hidden rounded-full border border-border bg-background">
          {/* 内容层三态，压缩中数字与色底让位给居中转圈，失败亮红色感叹号三秒，描边在层外保持静止 */}
          <span className="absolute inset-0 flex items-center justify-center">
            {compressing ? (
              <Loader2
                className={cn(
                  'relative h-3 w-3 animate-spin',
                  toneClass(pctRaw, 'text')
                )}
              />
            ) : failVisible ? (
              <AlertCircle className="relative h-3 w-3 text-red-500" />
            ) : (
              <>
                {hasUsage && (
                  <span
                    className={cn(
                      'absolute inset-y-0 left-0 opacity-[0.16]',
                      toneClass(pctRaw, 'bg')
                    )}
                    style={{ width: `${Math.min(100, pctRaw)}%` }}
                  />
                )}
                {hasUsage ? (
                  <span
                    className={cn(
                      'relative text-micro font-medium tabular-nums',
                      toneClass(pctRaw, 'text')
                    )}
                  >
                    {pctLabel}%
                  </span>
                ) : (
                  <Minimize2 className="relative h-3 w-3 text-muted-foreground" />
                )}
              </>
            )}
          </span>
        </span>
      </button>
      {/* 悬停面板锚在壳上方，pb 垫高层桥接壳与面板防移入闪烁，压缩进行中跟随关闭 */}
      {hasUsage && !compressing && snapshot && shown != null && (
        <div className="pointer-events-none absolute bottom-full right-0 z-50 pb-1.5 opacity-0 transition-opacity group-hover/shell:pointer-events-auto group-hover/shell:opacity-100">
          <UsagePanel
            used={shown}
            windowSize={snapshot.window}
            pctRaw={pctRaw}
            pctLabel={pctLabel}
            shares={snapshot.shares}
            autoCompress={autoCompress}
          />
        </div>
      )}
      {/* 图标壳悬停浮出压缩两字小气泡，占用面板不出现 */}
      {!hasUsage && (
        <div className="pointer-events-none absolute bottom-full right-0 z-50 pb-1.5 opacity-0 transition-opacity group-hover/shell:opacity-100">
          <div className="rounded-md border border-border bg-background px-2.5 py-1 text-caption text-foreground shadow-md">
            {t('inputBox.compressAction')}
          </div>
        </div>
      )}
    </div>
  );
}
