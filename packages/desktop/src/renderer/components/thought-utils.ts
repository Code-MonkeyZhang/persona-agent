/**
 * @file src/renderer/components/thought-utils.ts
 * @description 思考过程（thought）显示相关的工具函数，包括图标映射、颜色映射、标签映射和工具输入格式化
 */

import { Lightbulb, Braces, XCircle, Zap, type LucideIcon } from 'lucide-react';
import type { ThoughtType } from '../types/chat';

/**
 * Truncate text with ellipsis if exceeds max length
 */
export function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 1) + '…';
}

/**
 * Get icon component for thought type
 */
export function getThoughtIcon(
  type: ThoughtType,
  _toolName?: string
): LucideIcon {
  switch (type) {
    case 'thinking':
      return Lightbulb;
    case 'tool_use':
      return Braces;
    case 'error':
      return XCircle;
    default:
      return Zap;
  }
}

/**
 * Get Tailwind color class for thought type
 */
export function getThoughtColor(type: ThoughtType, isError?: boolean): string {
  if (isError) return 'text-amber-500';

  switch (type) {
    case 'thinking':
      return 'text-blue-400';
    case 'tool_use':
      return 'text-amber-400';
    case 'error':
      return 'text-red-500';
    default:
      return 'text-gray-500';
  }
}

/**
 * Get display label for thought type
 */
export function getThoughtLabel(type: ThoughtType): string {
  switch (type) {
    case 'thinking':
      return 'Thinking';
    case 'tool_use':
      return 'Tool call';
    case 'error':
      return 'Error';
    default:
      return 'AI';
  }
}

/**
 * Format tool input into human-readable summary
 */
export function getToolFriendlyFormat(
  toolName: string,
  toolInput?: Record<string, unknown>
): string {
  if (!toolInput) return '';

  switch (toolName) {
    case 'Bash':
      return typeof toolInput.command === 'string' ? toolInput.command : '';

    case 'Read':
      return typeof toolInput.file_path === 'string' ? toolInput.file_path : '';

    case 'Write':
      return typeof toolInput.file_path === 'string'
        ? `${toolInput.file_path} (new)`
        : '';

    case 'Edit':
      return typeof toolInput.file_path === 'string'
        ? `${toolInput.file_path} (edit)`
        : '';

    case 'Grep': {
      const pattern =
        typeof toolInput.pattern === 'string' ? `"${toolInput.pattern}"` : '';
      const path =
        typeof toolInput.path === 'string' ? ` in ${toolInput.path}` : '';
      return `Search ${pattern}${path}`;
    }

    case 'Glob':
      return typeof toolInput.pattern === 'string'
        ? `Match ${toolInput.pattern}`
        : '';

    case 'WebFetch': {
      if (typeof toolInput.url === 'string') {
        try {
          return new URL(toolInput.url).hostname.replace('www.', '');
        } catch {
          return toolInput.url;
        }
      }
      return '';
    }

    case 'WebSearch':
      return typeof toolInput.query === 'string'
        ? `Search: ${toolInput.query}`
        : '';

    default:
      for (const value of Object.values(toolInput)) {
        if (typeof value === 'string' && value.length > 0) {
          return truncateText(value, 80);
        }
      }
      return '';
  }
}
