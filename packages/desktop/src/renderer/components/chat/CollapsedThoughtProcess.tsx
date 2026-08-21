/**
 * @file src/renderer/components/chat/CollapsedThoughtProcess.tsx
 * @description 折叠的思考过程展示组件，默认折叠，展开后显示完整的 Agent 思考步骤详情
 */

import { useState, useRef, useEffect, memo } from 'react';
import {
  XCircle,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  CheckCircle,
  AlertTriangle,
  Braces,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getThoughtIcon,
  getThoughtColor,
  getToolFriendlyFormat,
  truncateText,
} from './thought-utils';
import type { Thought } from '../../types/chat';

interface CollapsedThoughtProcessProps {
  thoughts: Thought[];
  defaultExpanded?: boolean;
}

/**
 * Single thought item rendered as a timeline node with circular icon and connector line.
 */
const ThoughtItem = memo(function ThoughtItem({
  thought,
  isLast,
}: {
  thought: Thought;
  isLast: boolean;
}) {
  const { t } = useTranslation();
  const [isContentExpanded, setIsContentExpanded] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);
  const [showResult, setShowResult] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [needsExpand, setNeedsExpand] = useState(false);

  const isThinking = thought.type === 'thinking';
  const color = getThoughtColor(thought.type, thought.isError);
  const Icon = getThoughtIcon(thought.type, thought.toolName);
  const hasToolResult = thought.type === 'tool_use' && thought.toolResult;
  const hasToolInput =
    thought.type === 'tool_use' &&
    !!thought.toolInput &&
    Object.keys(thought.toolInput).length > 0;
  const hasResultOutput =
    thought.type === 'tool_use' && !!thought.toolResult?.output;
  const labelKey =
    thought.type === 'tool_use'
      ? 'thoughtProcess.toolCall'
      : thought.type === 'thinking'
        ? 'thoughtProcess.thinking'
        : thought.type === 'text'
          ? 'thoughtProcess.text'
          : 'thoughtProcess.error';
  const isError = !!thought.toolResult?.isError;
  const circleBg = isError ? 'bg-amber-500/20' : 'bg-muted';

  const content =
    thought.type === 'tool_use'
      ? getToolFriendlyFormat(thought.toolName || '', thought.toolInput)
      : thought.content || '';

  useEffect(() => {
    const el = contentRef.current;
    if (el) {
      setNeedsExpand(el.scrollHeight > el.clientHeight);
    }
  }, [content]);

  /** Toggle button class - blue when active, gray when idle */
  const toggleBtnClass = (active: boolean) =>
    `px-1 py-0.5 rounded transition-colors ${
      active
        ? 'bg-blue-100 text-blue-600'
        : 'text-gray-400 hover:text-gray-600 hover:bg-muted-foreground/10'
    }`;

  return (
    <div className="flex gap-3 py-1 text-xs">
      {/* Timeline: circular icon + connector line */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className={`w-7 h-7 rounded-full flex items-center justify-center ${circleBg}`}
        >
          {hasToolResult ? (
            thought.toolResult!.isError ? (
              <AlertTriangle size={14} className="text-amber-500" />
            ) : (
              <CheckCircle size={14} className="text-green-400" />
            )
          ) : (
            <Icon size={14} className={color} />
          )}
        </div>
        {!isLast && <div className="w-0.5 flex-1 bg-border mt-1" />}
      </div>

      {/* Content: header + text + actions */}
      <div className={`flex-1 min-w-0 ${isLast ? '' : 'pb-3'}`}>
        {/* Header: label + toolName */}
        <div className="flex items-center gap-2">
          <span
            className={`font-medium ${
              thought.toolResult?.isError ? 'text-amber-500' : color
            }`}
          >
            {t(labelKey)}
            {thought.toolName && ` - ${thought.toolName}`}
          </span>
        </div>

        {/* Content + Actions */}
        {content && (
          <div className="flex items-end gap-3 mt-0.5">
            <div
              className={`flex-1 min-w-0 ${isThinking ? 'italic text-muted-foreground/70' : 'text-gray-500'}`}
            >
              <div
                ref={contentRef}
                className={`whitespace-pre-wrap break-words ${
                  isContentExpanded ? 'animate-slide-down' : 'line-clamp-2'
                }`}
              >
                {content}
              </div>
            </div>

            {/* Actions: expand toggle + raw JSON + result */}
            {(needsExpand || hasToolInput || hasResultOutput) && (
              <div className="flex items-center gap-1 shrink-0">
                {needsExpand && (
                  <button
                    onClick={() => setIsContentExpanded(!isContentExpanded)}
                    className="px-1 py-0.5 rounded text-blue-500 hover:text-blue-600 transition-colors"
                  >
                    {isContentExpanded
                      ? t('thoughtProcess.collapse')
                      : t('thoughtProcess.expand')}
                  </button>
                )}
                {hasToolInput && (
                  <button
                    onClick={() => setShowRawJson(!showRawJson)}
                    className={toggleBtnClass(showRawJson)}
                    title={
                      showRawJson
                        ? t('thoughtProcess.hideRawJson')
                        : t('thoughtProcess.showRawJson')
                    }
                  >
                    <Braces size={10} />
                  </button>
                )}
                {hasResultOutput && (
                  <button
                    onClick={() => setShowResult(!showResult)}
                    className={toggleBtnClass(showResult)}
                  >
                    {showResult
                      ? t('thoughtProcess.hide')
                      : t('thoughtProcess.result')}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Raw JSON display */}
        {hasToolInput && showRawJson && (
          <pre className="mt-2 p-2 rounded bg-muted/40 text-[10px] text-gray-600 overflow-x-auto">
            {JSON.stringify(thought.toolInput, null, 2)}
          </pre>
        )}

        {/* Tool result */}
        {hasResultOutput && showResult && (
          <div
            className={`mt-1.5 p-2 rounded text-[10px] overflow-x-auto ${
              thought.toolResult!.isError
                ? 'bg-amber-50 text-amber-700'
                : 'bg-muted/40 text-gray-600'
            }`}
          >
            <pre className="whitespace-pre-wrap break-all">
              {truncateText(thought.toolResult!.output, 300)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
});

/**
 * 折叠的思考过程展示组件，默认折叠显示摘要，展开后可查看每一步思考详情
 * @param props.thoughts - 该消息关联的思考步骤列表
 * @param props.defaultExpanded - 是否默认展开，默认为 false
 */
export function CollapsedThoughtProcess({
  thoughts,
  defaultExpanded = false,
}: CollapsedThoughtProcessProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isMaximized, setIsMaximized] = useState(false);

  if (thoughts.length === 0) return null;

  const errorCount = thoughts.filter((t) => t.type === 'error').length;

  return (
    <div className="mb-2 w-full">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs
          transition-opacity duration-200 w-full hover:opacity-60"
      >
        <ChevronRight
          size={12}
          className={`text-gray-400 transition-transform duration-200 ${
            isExpanded ? 'rotate-90' : ''
          }`}
        />

        {errorCount > 0 && <XCircle size={14} className="text-red-500" />}

        <span className="text-gray-500">
          {t('thoughtProcess.showThinking')}
        </span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-1 py-2 bg-muted/20 rounded-lg border border-border/30 animate-slide-down">
          <div
            className={`${isMaximized ? 'max-h-[80vh]' : 'max-h-[300px]'} overflow-auto px-3`}
          >
            {thoughts.map((thought, index) => (
              <ThoughtItem
                key={`${thought.id}-${index}`}
                thought={thought}
                isLast={index === thoughts.length - 1}
              />
            ))}
          </div>

          {/* Maximize toggle */}
          {(thoughts.length > 8 || isMaximized) && (
            <div className="flex justify-end px-3 mt-1">
              <button
                onClick={() => setIsMaximized(!isMaximized)}
                className="flex items-center gap-0.5 px-1 py-0.5 rounded text-xs text-gray-400 hover:text-gray-600 hover:bg-muted-foreground/10 transition-colors"
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
