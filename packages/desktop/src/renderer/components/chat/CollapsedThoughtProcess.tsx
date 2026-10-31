/**
 * @file 消息内思考过程组件，与顶栏时间线同一套行语言
 * 入口透明无底色，文案恒为思考过程不带步数，失败不改色
 * 展开后是平面行，身份图标加自然语言动向句，竖向连线把步骤串起来
 * 行可点开段式详情浮层，思考行看全文，工具行看输入输出，失败行多错误区
 */

import { memo, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Lightbulb,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { phraseForThought, toolIcon } from './LiveStrip';
import { RowDetailDialog, type RowDetail } from './RowDetailDialog';
import type { Thought } from '../../types/chat';

interface CollapsedThoughtProcessProps {
  thoughts: Thought[];
  defaultExpanded?: boolean;
}

/**
 * 单条步骤行，与时间线的行语言同构
 * 前置位身份图标，工具行走自然语言动向句，思考行走正文 muted 灰两行截断
 * 失败行整句红字紧跟 circle-x，错误明细只进详情浮层
 */
const ThoughtItem = memo(function ThoughtItem({
  thought,
  isLast,
}: {
  thought: Thought;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  const [detailOpen, setDetailOpen] = useState(false);

  const isTool = thought.type === 'tool_use';
  const isErrorType = thought.type === 'error';
  const isFailed = isTool && !!(thought.isError || thought.toolResult?.isError);
  const Icon = isTool
    ? toolIcon(thought.toolName || '')
    : isErrorType
      ? XCircle
      : Lightbulb;
  const summary = phraseForThought(t, thought);

  // 详情载荷，工具行带原始入参才可看，思考行与错误行看全文
  const detail: RowDetail | null = isTool
    ? thought.toolInput
      ? {
          kind: 'tool',
          tool: thought.toolName ?? '',
          summary,
          input: JSON.stringify(thought.toolInput),
          output: thought.toolResult?.output,
          failed: isFailed,
        }
      : null
    : { kind: 'think', text: thought.content ?? '' };

  // 浮层挂在本行之下，其点击会沿合成事件冒泡回来，目标不在行内的一律忽略
  const fromRow = (e: React.MouseEvent) =>
    e.currentTarget.contains(e.target as Node);

  return (
    <div
      onClick={
        detail
          ? (e) => {
              if (!fromRow(e)) return;
              if (!detailOpen) setDetailOpen(true);
            }
          : undefined
      }
      className={`relative flex items-start gap-2 px-1 pt-1 transition-colors group/row ${
        detail ? 'cursor-pointer hover:bg-muted/40' : ''
      } ${isLast ? 'pb-1' : 'pb-3'}`}
    >
      <Icon
        className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${
          isErrorType || isFailed ? 'text-[#d5392e]' : 'text-muted-foreground'
        }`}
      />
      {!isLast && (
        // 竖向连线沿身份图标中心线垂到下一行图标顶，末行不垂线
        <div className="absolute left-[10px] top-[20px] bottom-[-4px] w-0.5 rounded-full bg-[#c3cfdf]" />
      )}
      {isFailed ? (
        // 失败行主文字不撑满整行，标记贴着文字尾部
        <div className="flex-1 min-w-0 flex items-start gap-2">
          <span className="min-w-0 text-caption text-[#d5392e]">{summary}</span>
          <XCircle className="w-[13px] h-[13px] mt-px text-[#d5392e] shrink-0" />
        </div>
      ) : (
        <span
          className={`flex-1 min-w-0 text-caption line-clamp-2 ${
            isErrorType ? 'text-[#d5392e]' : 'text-muted-foreground'
          } ${detail ? 'group-hover/row:underline' : ''}`}
        >
          {summary}
        </span>
      )}
      {detail && (
        <RowDetailDialog
          detail={detail}
          open={detailOpen}
          onOpenChange={setDetailOpen}
        />
      )}
    </div>
  );
});

/**
 * 消息内思考过程，默认收起，text 行不渲染与时间线口径一致
 * @param props.thoughts 该消息的思考步骤列表
 * @param props.defaultExpanded 是否默认展开，默认 false
 */
export function CollapsedThoughtProcess({
  thoughts,
  defaultExpanded = false,
}: CollapsedThoughtProcessProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isMaximized, setIsMaximized] = useState(false);

  const steps = thoughts.filter((th) => th.type !== 'text');
  if (steps.length === 0) return null;

  return (
    <div className="mb-2 w-full">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-caption
          transition-opacity duration-200 w-full hover:opacity-60"
      >
        <ChevronRight
          size={12}
          className={`text-muted-foreground transition-transform duration-200 ${
            isExpanded ? 'rotate-90' : ''
          }`}
        />
        <span className="text-muted-foreground">
          {t('thoughtProcess.entry')}
        </span>
      </button>

      {isExpanded && (
        <div className="mt-1 py-2 bg-muted/20 rounded-lg border border-border/30 animate-slide-down">
          <div
            className={`${isMaximized ? 'max-h-[80vh]' : 'max-h-[300px]'} overflow-auto px-3`}
          >
            {steps.map((thought, index) => (
              <ThoughtItem
                key={`${thought.id}-${index}`}
                thought={thought}
                isLast={index === steps.length - 1}
              />
            ))}
          </div>

          {(steps.length > 8 || isMaximized) && (
            <div className="flex justify-end px-3 mt-1">
              <button
                onClick={() => setIsMaximized(!isMaximized)}
                className="flex items-center gap-0.5 px-1 py-0.5 rounded text-caption text-gray-400 hover:text-gray-600 hover:bg-muted-foreground/10 transition-colors"
              >
                {isMaximized ? (
                  <ChevronUp size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
                {isMaximized
                  ? t('thoughtProcess.compact')
                  : t('thoughtProcess.full')}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
