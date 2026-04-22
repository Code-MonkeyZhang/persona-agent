/**
 * @file components/MessageList.tsx
 * @description 聊天消息列表组件，基于 react-virtuoso 实现虚拟滚动，支持滚动位置缓存与恢复
 * 消息采用 Chatbox 风格气泡布局，用户蓝色右对齐、助手灰色左对齐，带头像
 */

import React, {
  useState,
  useRef,
  useEffect,
  useImperativeHandle,
  useCallback,
} from 'react';
import {
  Virtuoso,
  type VirtuosoHandle,
  type StateSnapshot,
} from 'react-virtuoso';
import type { Message } from '../types/chat';
import type { Agent } from '../types/agent';
import { cn } from '../lib/utils';
import { Copy, Check } from 'lucide-react';
import { toast } from '../stores/toastStore';
import { CollapsedThoughtProcess } from './CollapsedThoughtProcess';
import { Markdown } from './Markdown';
import { AgentAvatar } from './AgentAvatar';
import {
  setScrollPosition,
  getScrollPosition,
  hasScrollPosition,
} from '../stores/scrollPositionCache';

export interface MessageListRef {
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

interface MessageItemProps {
  message: Message;
  agent: Agent | null;
}

/**
 * 单条消息渲染组件，Chatbox 风格气泡布局：
 * - 用户消息：蓝色背景右对齐，灰色圆形 "U" 头像
 * - 助手消息：灰色背景左对齐，AgentAvatar 头像，气泡上方展示思考过程
 * - 错误消息：红色背景左对齐
 * hover 时显示复制按钮
 */
const MessageItem: React.FC<MessageItemProps> = ({ message, agent }) => {
  const [copied, setCopied] = useState(false);
  const isUser = message.type === 'user';
  const isError = message.type === 'error';
  const isAssistant = message.type === 'assistant';
  const hasThoughts = message.thoughts && message.thoughts.length > 0;
  const hasContent = message.content.trim().length > 0;

  /** 将消息内容复制到剪贴板，成功后显示 2 秒的对勾反馈 */
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <div
      className={cn(
        'flex w-full pb-3 px-6 gap-2.5',
        isUser ? 'flex-row-reverse' : ''
      )}
    >
      {/* 头像 */}
      {isUser ? (
        <div className="h-7 w-7 shrink-0 mt-0.5 rounded-full flex items-center justify-center text-xs font-medium bg-gray-100 text-gray-600">
          U
        </div>
      ) : (
        agent && (
          <AgentAvatar
            agent={agent}
            size="sm"
            className="shrink-0 mt-0.5 w-7 h-7"
          />
        )
      )}

      {/* 内容区域 */}
      <div
        className={cn(
          'group max-w-[85%]',
          isUser ? 'flex flex-col items-end' : 'flex flex-col items-start'
        )}
      >
        {/* 思考过程（仅助手消息，在气泡上方） */}
        {isAssistant && hasThoughts && (
          <CollapsedThoughtProcess thoughts={message.thoughts!} />
        )}

        {/* 气泡 */}
        {hasContent && (
          <div
            className={cn(
              'px-4 py-2.5 rounded-2xl',
              isUser && 'bg-[#228be6] text-white',
              isError && 'bg-red-50 text-red-900 border border-red-200',
              !isUser && !isError && 'bg-[#f1f3f5] text-[#333]'
            )}
          >
            <Markdown content={message.content} />
          </div>
        )}

        {/* 操作按钮（hover 时显示） */}
        <div
          className={cn(
            'flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity',
            isUser ? 'justify-end' : 'justify-start'
          )}
        >
          {hasContent && (
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              title="Copy content"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

interface MessageListProps {
  messages: Message[];
  isLoading?: boolean;
  sessionId: string | null;
  hasAgent?: boolean;
  agent: Agent | null;
}

/**
 * 消息列表主组件，使用 Virtuoso 虚拟滚动渲染大量消息，支持滚动位置缓存与恢复
 * 通过 forwardRef 暴露 scrollToBottom 给父组件
 */
export const MessageList = React.forwardRef<MessageListRef, MessageListProps>(
  ({ messages, isLoading, sessionId, hasAgent = true, agent }, ref) => {
    const virtuosoRef = useRef<VirtuosoHandle>(null);

    useImperativeHandle(ref, () => ({
      scrollToBottom: (behavior: ScrollBehavior = 'instant') => {
        virtuosoRef.current?.scrollTo({ top: Infinity, behavior });
      },
    }));

    useEffect(() => {
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollTo({ top: Infinity, behavior: 'smooth' });
      });
    }, [messages.length]);

    /** 将当前滚动状态按 sessionId 写入缓存 */
    const saveScrollState = useCallback(
      (state: StateSnapshot) => {
        if (sessionId && state.ranges.length > 0) {
          setScrollPosition(sessionId, state);
        }
      },
      [sessionId]
    );

    useEffect(() => {
      const currentVirtuoso = virtuosoRef.current;
      return () => {
        currentVirtuoso?.getState((state) => {
          saveScrollState(state);
        });
      };
    }, [saveScrollState]);

    if (messages.length === 0 && !isLoading) {
      return (
        <div className="flex-1 min-h-0 flex items-center justify-center text-gray-400">
          <p>{hasAgent ? 'Start a conversation...' : '请先创建 Agent'}</p>
        </div>
      );
    }

    const cachedPosition = sessionId ? getScrollPosition(sessionId) : undefined;
    const hasCachedPosition = sessionId ? hasScrollPosition(sessionId) : false;

    return (
      <div className="flex-1 min-h-0">
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%' }}
          data={messages}
          followOutput="smooth"
          {...(hasCachedPosition && cachedPosition
            ? {
                restoreStateFrom: cachedPosition,
                initialScrollTop: cachedPosition.scrollTop,
              }
            : {
                initialTopMostItemIndex: messages.length - 1,
              })}
          increaseViewportBy={{ top: 2000, bottom: 2000 }}
          itemContent={(_index, message) => (
            <MessageItem key={message.id} message={message} agent={agent} />
          )}
        />
      </div>
    );
  }
);
