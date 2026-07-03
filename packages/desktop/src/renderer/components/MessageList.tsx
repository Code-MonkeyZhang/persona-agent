/**
 * @file components/MessageList.tsx
 * @description 聊天消息列表组件，基于 react-virtuoso 实现虚拟滚动，支持滚动位置缓存与恢复
 * 消息采用 Chatbox 风格气泡布局，用户蓝色右对齐、助手灰色左对齐，带头像
 */

import React, {
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
import { useTranslation } from 'react-i18next';
import type { UIMessage } from '../types/chat';
import type { AgentConfig } from '../types/agent';
import { cn } from '../lib/utils';
import { toast } from '../stores/toastStore';
import { CopyButton } from './ui/CopyButton';
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
  message: UIMessage;
  agent: AgentConfig | null;
  isStreaming: boolean;
}

/**
 * 单条消息渲染组件，Chatbox 风格气泡布局：
 * - 用户消息：蓝色背景右对齐，灰色圆形 "U" 头像
 * - 助手消息：灰色背景左对齐，AgentAvatar 头像，气泡上方展示思考过程
 * - 错误消息：红色背景左对齐
 * hover 时显示复制按钮
 */
const MessageItem: React.FC<MessageItemProps> = ({
  message,
  agent,
  isStreaming,
}) => {
  const { t } = useTranslation();
  const isUser = message.type === 'user';
  const isError = message.type === 'error';
  const isAssistant = message.type === 'assistant';
  const hasThoughts = message.thoughts && message.thoughts.length > 0;
  const hasContent = message.content.trim().length > 0;
  const isWaiting = isStreaming && !hasContent && !hasThoughts;

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
        {/* 思考过程 */}
        {isAssistant && hasThoughts && (
          <CollapsedThoughtProcess thoughts={message.thoughts!} />
        )}

        {/* 等待中的打字动画 */}
        {isWaiting && (
          <div className="px-4 py-3 rounded-2xl">
            <div className="flex gap-1">
              <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-typing-dot" />
              <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-typing-dot [animation-delay:200ms]" />
              <span className="w-1.5 h-1.5 bg-muted-foreground/40 rounded-full animate-typing-dot [animation-delay:400ms]" />
            </div>
          </div>
        )}

        {/* 气泡 */}
        {hasContent && (
          <div
            className={cn(
              'px-4 py-2.5 rounded-2xl',
              isUser && 'bg-primary text-primary-foreground msg-bubble-user',
              isError && 'bg-red-50 text-red-900 border border-red-200',
              !isUser && !isError && 'bg-secondary text-foreground'
            )}
          >
            <Markdown content={message.content} />
          </div>
        )}

        {/* 操作按钮 */}
        <div
          className={cn(
            'flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity',
            isUser ? 'justify-end' : 'justify-start'
          )}
        >
          {hasContent && (
            <CopyButton
              text={message.content}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
              title={t('messageList.copyContent')}
              onCopied={() => toast.success(t('messageList.copiedToClipboard'))}
              onError={() => toast.error(t('messageList.failedToCopy'))}
            />
          )}
        </div>
      </div>
    </div>
  );
};

interface MessageListProps {
  messages: UIMessage[];
  isLoading?: boolean;
  streamingMessageId?: string | null;
  sessionId: string | null;
  hasAgent?: boolean;
  agent: AgentConfig | null;
}

/**
 * 消息列表主组件，使用 Virtuoso 虚拟滚动渲染大量消息，支持滚动位置缓存与恢复
 * 通过 forwardRef 暴露 scrollToBottom 给父组件
 */
export const MessageList = React.forwardRef<MessageListRef, MessageListProps>(
  (
    {
      messages,
      isLoading,
      streamingMessageId,
      sessionId,
      hasAgent = true,
      agent,
    },
    ref
  ) => {
    const { t } = useTranslation();
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
          <p>
            {hasAgent
              ? t('messageList.startConversation')
              : t('common.noAgent')}
          </p>
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
          components={{
            Header: () => <div className="h-4" />,
          }}
          itemContent={(_index, message) => (
            <MessageItem
              key={message.id}
              message={message}
              agent={agent}
              isStreaming={message.id === streamingMessageId}
            />
          )}
        />
      </div>
    );
  }
);
