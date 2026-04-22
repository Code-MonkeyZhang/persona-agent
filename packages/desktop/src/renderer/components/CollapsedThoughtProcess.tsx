/**
 * @file src/renderer/components/CollapsedThoughtProcess.tsx
 * @description 折叠的思考过程展示组件，默认折叠，展开后显示完整的 Agent 思考步骤详情
 */

import { useState, memo } from 'react';
import {
  Lightbulb,
  XCircle,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Braces,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  truncateText,
  getThoughtIcon,
  getThoughtColor,
  getThoughtLabel,
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
  const [showRawJson, setShowRawJson] = useState(false);
  const [showResult, setShowResult] = useState(true);
  const [isContentExpanded, setIsContentExpanded] = useState(false);

  const color = getThoughtColor(thought.type, thought.isError);
  const Icon = getThoughtIcon(thought.type, thought.toolName);
  const hasToolResult = thought.type === 'tool_use' && thought.toolResult;

  const content =
    thought.type === 'tool_use'
      ? getToolFriendlyFormat(thought.toolName || '', thought.toolInput)
      : thought.content || '';

  const maxLen = 120;
  const needsTruncate = content.length > maxLen;

  return (
    <div className="py-1.5 text-xs border-b border-gray-100 last:border-b-0">
      {/* First row: Icon + Tool name + Timestamp */}
      <div className="flex items-center gap-2">
        {hasToolResult ? (
          thought.toolResult!.isError ? (
            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
          ) : (
            <CheckCircle2 size={14} className="text-green-400 shrink-0" />
          )
        ) : (
          <Icon size={14} className={`${color} shrink-0`} />
        )}
        <span
          className={`font-medium ${
            thought.toolResult?.isError ? 'text-amber-500' : color
          } flex-1 min-w-0 truncate`}
        >
          {getThoughtLabel(thought.type)}
          {thought.toolName && ` - ${thought.toolName}`}
        </span>
      </div>

      {/* Content area */}
      <div className="flex items-end gap-3 mt-0.5 ml-[22px]">
        <div className="flex-1 min-w-0">
          {content && (
            <div className="text-gray-500 whitespace-pre-wrap break-words">
              {isContentExpanded || !needsTruncate
                ? content
                : content.substring(0, maxLen) + '...'}
              {needsTruncate && (
                <button
                  onClick={() => setIsContentExpanded(!isContentExpanded)}
                  className="ml-1 text-blue-500 hover:text-blue-600"
                >
                  {isContentExpanded ? 'Collapse' : 'Expand'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Actions */}
        {((thought.type === 'tool_use' &&
          thought.toolInput &&
          Object.keys(thought.toolInput).length > 0) ||
          hasToolResult) && (
          <div className="flex items-center gap-1 shrink-0">
            {thought.type === 'tool_use' &&
              thought.toolInput &&
              Object.keys(thought.toolInput).length > 0 && (
                <button
                  onClick={() => setShowRawJson(!showRawJson)}
                  className={`px-1 py-0.5 rounded transition-colors ${
                    showRawJson
                      ? 'bg-blue-100 text-blue-600'
                      : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
                  }`}
                  title={showRawJson ? 'Hide raw JSON' : 'Show raw JSON'}
                >
                  <Braces size={10} />
                </button>
              )}
            {hasToolResult && thought.toolResult!.output && (
              <button
                onClick={() => setShowResult(!showResult)}
                className="px-1 py-0.5 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                {showResult ? 'Hide' : 'Result'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Raw JSON display */}
      {thought.type === 'tool_use' && showRawJson && thought.toolInput && (
        <pre className="mt-2 ml-[22px] p-2 rounded bg-gray-100 text-[10px] text-gray-600 overflow-x-auto">
          {JSON.stringify(thought.toolInput, null, 2)}
        </pre>
      )}

      {/* Tool result */}
      {hasToolResult && thought.toolResult!.output && showResult && (
        <div
          className={`mt-1.5 ml-[22px] p-2 rounded text-[10px] overflow-x-auto ${
            thought.toolResult!.isError
              ? 'bg-amber-50 text-amber-700'
              : 'bg-gray-100 text-gray-600'
          }`}
        >
          <pre className="whitespace-pre-wrap break-all">
            {truncateText(thought.toolResult!.output, 300)}
          </pre>
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
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [isMaximized, setIsMaximized] = useState(false);

  if (thoughts.length === 0) return null;

  const errorCount = thoughts.filter((t) => t.type === 'error').length;

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs
          transition-all duration-200 w-full ${
            isExpanded
              ? 'bg-blue-50 border border-blue-200'
              : 'bg-gray-50 hover:bg-gray-100 border border-transparent'
          }`}
      >
        <ChevronRight
          size={12}
          className={`text-gray-400 transition-transform duration-200 ${
            isExpanded ? 'rotate-90' : ''
          }`}
        />

        {errorCount > 0 ? (
          <XCircle size={14} className="text-red-500" />
        ) : (
          <Lightbulb size={14} className="text-blue-500" />
        )}

        <span className="text-gray-500">Show Thinking</span>
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="mt-1 py-2 bg-gray-50 rounded-lg border border-gray-200 animate-slide-down">
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
                className="flex items-center gap-0.5 px-1 py-0.5 rounded text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                {isMaximized ? (
                  <ChevronUp size={12} />
                ) : (
                  <ChevronDown size={12} />
                )}
                {isMaximized ? 'Compact' : 'Full'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
