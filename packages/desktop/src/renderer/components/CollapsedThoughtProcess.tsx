/**
 * @file src/renderer/components/CollapsedThoughtProcess.tsx
 * @description 折叠的思考过程展示组件，默认折叠，展开后显示完整的 Agent 思考步骤详情
 */

import { useState, memo } from 'react';
import {
  XCircle,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  getThoughtIcon,
  getThoughtColor,
  getToolFriendlyFormat,
} from './thought-utils';
import type { Thought } from '../types/chat';

interface CollapsedThoughtProcessProps {
  thoughts: Thought[];
  defaultExpanded?: boolean;
}

/**
 * Single thought item in expanded view
 */
const ThoughtItem = memo(function ThoughtItem({
  thought,
}: {
  thought: Thought;
}) {
  const { t } = useTranslation();
  const [isContentExpanded, setIsContentExpanded] = useState(false);

  const color = getThoughtColor(thought.type, thought.isError);
  const Icon = getThoughtIcon(thought.type, thought.toolName);
  const hasToolResult = thought.type === 'tool_use' && thought.toolResult;
  const labelKey =
    thought.type === 'tool_use'
      ? 'thoughtProcess.toolCall'
      : thought.type === 'thinking'
        ? 'thoughtProcess.thinking'
        : 'thoughtProcess.error';

  const content =
    thought.type === 'tool_use'
      ? getToolFriendlyFormat(thought.toolName || '', thought.toolInput)
      : thought.content || '';

  const maxLen = 120;
  const needsTruncate = content.length > maxLen;

  return (
    <div className="py-1.5 text-xs border-b border-gray-100 last:border-b-0">
      {/* Header row: Icon + label + toolName */}
      <div className="flex items-center gap-2">
        {hasToolResult ? (
          thought.toolResult!.isError ? (
            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
          ) : (
            <CheckCircle size={14} className="text-green-400 shrink-0" />
          )
        ) : (
          <Icon size={14} className={`${color} shrink-0`} />
        )}
        <span
          className={`font-medium ${
            thought.toolResult?.isError ? 'text-amber-500' : color
          } flex-1 min-w-0 truncate`}
        >
          {t(labelKey)}
          {thought.toolName && ` - ${thought.toolName}`}
        </span>
      </div>

      {/* Content */}
      {content && (
        <div className="mt-0.5 ml-[22px] text-gray-500 whitespace-pre-wrap break-words">
          {isContentExpanded || !needsTruncate
            ? content
            : content.substring(0, maxLen) + '...'}
          {needsTruncate && (
            <button
              onClick={() => setIsContentExpanded(!isContentExpanded)}
              className="ml-1 text-blue-500 hover:text-blue-600"
            >
              {isContentExpanded
                ? t('thoughtProcess.collapse')
                : t('thoughtProcess.expand')}
            </button>
          )}
        </div>
      )}
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
    <div className="mb-2">
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
        <div className="mt-1 py-2 animate-slide-down">
          <div
            className={`${isMaximized ? 'max-h-[80vh]' : 'max-h-[300px]'} overflow-auto px-3`}
          >
            {thoughts.map((thought, index) => (
              <ThoughtItem key={`${thought.id}-${index}`} thought={thought} />
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
