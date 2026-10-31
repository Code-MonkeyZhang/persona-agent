/**
 * @file 时间线行的段式详情浮层，三类行共用一个入口
 * 头部是图标徽章加工具名或行类型名，正文按段组织，每段小标题行右侧配段级复制钮
 * 关闭语义是拦掉指针外部关闭，点击落在浮层之外才关闭，遮罩吃掉点击不穿透到行
 */

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Braces,
  FileText,
  Lightbulb,
  MessageSquare,
  TerminalSquare,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '../ui/Dialog';
import { CopyButton } from '../ui/CopyButton';
import { toolIcon } from './LiveStrip';

/** 时间线行的详情载荷，三类行共用一个浮层
 *  工具行带原始入参与输出，用户行与思考行只带全文，failed 标记失败行浮层头部多一块错误区 */
export type RowDetail =
  | {
      kind: 'tool';
      tool: string;
      summary: string;
      input: string;
      output?: string;
      failed?: boolean;
    }
  | { kind: 'user'; text: string }
  | { kind: 'think'; text: string };

/** 安全解析 JSON 字符串，失败返回 null 由调用方走原文渲染 */
function tryParseJson(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === 'object' && parsed !== null
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

/** 输出载荷按工具类型解析的分支数据，终端取 output，文件取 content，Grep 取 matches */
function outputPayload(output?: string): {
  kind: 'terminal' | 'file' | 'matches' | 'json' | 'raw' | 'empty';
  text?: string;
  file?: string;
  matches?: string[];
  raw?: string;
} {
  if (!output) return { kind: 'empty' };
  const parsed = tryParseJson(output);
  if (!parsed) return { kind: 'raw', raw: output };
  if (typeof parsed.output === 'string') {
    return { kind: 'terminal', text: parsed.output };
  }
  if (typeof parsed.content === 'string') {
    return {
      kind: 'file',
      text: parsed.content,
      file: String(parsed.file ?? ''),
    };
  }
  if (Array.isArray(parsed.matches)) {
    return { kind: 'matches', matches: parsed.matches.map(String) };
  }
  return { kind: 'json', raw: JSON.stringify(parsed, null, 2) };
}

/**
 * 复制段的小标题行，左图标加标签，右复制钮复用 CopyButton 的绿勾反馈
 * @param icon 段图标
 * @param label 段标签
 * @param copyText 该段的复制载荷
 * @param copyTitle 复制钮的悬停提示
 */
function SectionHeader({
  icon: Icon,
  label,
  copyText,
  copyTitle,
}: {
  icon: LucideIcon;
  label: string;
  copyText: string;
  copyTitle: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-micro text-muted-foreground">
        <Icon className="w-3 h-3" />
        <span className="font-medium tracking-wider uppercase">{label}</span>
      </div>
      <CopyButton
        text={copyText}
        title={copyTitle}
        className="flex items-center justify-center w-7 h-7 rounded-md transition-colors shrink-0 select-none text-muted-foreground hover:text-foreground hover:bg-foreground/5"
      />
    </div>
  );
}

/**
 * 时间线行的详情浮层，三类行统一入口，输出按六种形态解析渲染
 * @param detail 行详情载荷
 * @param open 受控开态
 * @param onOpenChange 开态回调
 */
export function RowDetailDialog({
  detail,
  open,
  onOpenChange,
}: {
  detail: RowDetail;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const isTool = detail.kind === 'tool';
  const inputParsed = isTool ? tryParseJson(detail.input) : null;
  const inputJson =
    isTool && inputParsed ? JSON.stringify(inputParsed, null, 2) : '';
  const out = isTool ? outputPayload(detail.output) : null;
  // 失败行错误区文本，终端类输出前拼 exit 码，其余输出原样进错误区
  const errExit =
    isTool && detail.failed
      ? (() => {
          const p = tryParseJson(detail.output ?? '');
          return p && typeof p.exitCode === 'number' ? p.exitCode : null;
        })()
      : null;
  const errorText =
    isTool && detail.failed
      ? out?.kind === 'terminal' && out.text
        ? errExit != null
          ? `exit ${errExit}\n\n${out.text}`
          : out.text
        : (detail.output ?? '')
      : '';
  // 输出段的复制载荷，matches 按行拼接，其余取原文
  const outputPlain =
    out == null || out.kind === 'empty'
      ? ''
      : out.kind === 'matches'
        ? (out.matches?.join('\n') ?? '')
        : (out.text ?? out.raw ?? '');

  // 点击外部关闭，监听挂 document 捕获阶段，目标是浮层内容才放过，否则只关闭
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[role=dialog]')) return;
      onOpenChange(false);
    };
    document.addEventListener('click', onDocClick, true);
    return () => document.removeEventListener('click', onDocClick, true);
  }, [open, onOpenChange]);

  const BadgeIcon = isTool
    ? toolIcon(detail.tool)
    : detail.kind === 'user'
      ? MessageSquare
      : Lightbulb;
  const badgeLabel = isTool
    ? detail.tool
    : detail.kind === 'user'
      ? t('live.userMessage')
      : t('live.thinkingSection');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onClick={(e) => e.stopPropagation()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onFocusOutside={(e) => e.preventDefault()}
        className="w-[90vw] max-w-[1100px] max-h-[85vh] overflow-y-auto rounded-2xl sm:rounded-2xl"
      >
        <DialogHeader>
          <DialogTitle className="sr-only">{badgeLabel}</DialogTitle>
          <div className="flex items-center gap-2 pr-7">
            <span
              className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-micro font-medium shrink-0 ${
                isTool && detail.failed
                  ? 'bg-red-500/10 text-[#d5392e]'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <BadgeIcon className="w-3 h-3" />
              {badgeLabel}
            </span>
          </div>
          {isTool && (
            <DialogDescription className="truncate">
              {detail.summary}
            </DialogDescription>
          )}
        </DialogHeader>

        {detail.kind === 'user' || detail.kind === 'think' ? (
          <section className="space-y-2">
            <SectionHeader
              icon={detail.kind === 'user' ? MessageSquare : Lightbulb}
              label={t('live.content')}
              copyText={detail.text}
              copyTitle={t('live.copy')}
            />
            <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap break-words">
              {detail.text}
            </p>
          </section>
        ) : (
          <>
            {detail.failed && (
              <section className="space-y-2">
                <SectionHeader
                  icon={XCircle}
                  label={t('live.error')}
                  copyText={errorText}
                  copyTitle={t('live.copyError')}
                />
                <pre className="rounded-md bg-red-500/10 border border-red-500/20 p-3 font-mono text-xs text-[#d5392e] whitespace-pre-wrap break-all leading-relaxed">
                  {errorText}
                </pre>
              </section>
            )}

            <section className="space-y-2">
              <SectionHeader
                icon={Braces}
                label={t('live.input')}
                copyText={inputJson}
                copyTitle={t('live.copyInput')}
              />
              <pre className="rounded-md bg-muted p-3 font-mono text-xs text-foreground/80 whitespace-pre-wrap break-all leading-relaxed">
                {inputJson}
              </pre>
            </section>

            <section className="space-y-2">
              <SectionHeader
                icon={TerminalSquare}
                label={t('live.output')}
                copyText={outputPlain}
                copyTitle={t('live.copyOutput')}
              />
              {out?.kind === 'empty' && (
                <p className="text-xs text-muted-foreground">
                  {t('live.noOutput')}
                </p>
              )}
              {(out?.kind === 'raw' || out?.kind === 'json') && (
                <pre className="rounded-md bg-muted p-3 font-mono text-xs text-foreground/80 whitespace-pre-wrap break-all leading-relaxed">
                  {out.raw}
                </pre>
              )}
              {out?.kind === 'terminal' && (
                <pre className="rounded-md bg-muted p-3 font-mono text-xs text-foreground/85 whitespace-pre-wrap break-all leading-relaxed">
                  {out.text}
                </pre>
              )}
              {out?.kind === 'file' && (
                <div className="rounded-md border border-border overflow-hidden">
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-xs text-muted-foreground">
                    <FileText className="w-3 h-3 shrink-0" />
                    <span className="font-mono truncate">{out.file}</span>
                  </div>
                  <pre className="p-3 font-mono text-xs text-foreground/85 whitespace-pre overflow-x-auto leading-relaxed">
                    {out.text}
                  </pre>
                </div>
              )}
              {out?.kind === 'matches' && (
                <ul className="rounded-md border border-border divide-y divide-border">
                  {out.matches?.map((m, i) => (
                    <li
                      key={i}
                      className="px-3 py-1.5 font-mono text-xs text-foreground/80 break-all leading-relaxed"
                    >
                      {m}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
