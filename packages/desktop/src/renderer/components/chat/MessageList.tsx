/**
 * @file src/renderer/components/chat/MessageList.tsx
 * @description 聊天消息列表组件，基于 react-virtuoso 实现虚拟滚动，支持滚动位置缓存与恢复
 * 消息采用 Chatbox 风格气泡布局，用户蓝色右对齐、助手灰色左对齐，带头像
 */

import React, {
  useRef,
  useState,
  useEffect,
  useImperativeHandle,
  useCallback,
  useMemo,
} from 'react';
import {
  Virtuoso,
  type VirtuosoHandle,
  type StateSnapshot,
} from 'react-virtuoso';
import { useTranslation } from 'react-i18next';
import type { UIMessage } from '../../types/chat';
import type { AgentConfig } from '../../types/agent';
import { cn } from '../../lib/utils';
import { logger } from '../../lib/logger';
import { toast } from '../../stores/toastStore';
import { CopyButton } from '../ui/CopyButton';
import { CollapsedThoughtProcess } from './CollapsedThoughtProcess';
import { Markdown } from '../common/Markdown';
import { AgentAvatar } from '../common/AgentAvatar';
import { ScrollToBottomButton } from './ScrollToBottomButton';
import {
  setScrollPosition,
  getScrollPosition,
  hasScrollPosition,
} from '../../stores/scrollPositionCache';

export interface MessageListRef {
  scrollToBottom: (behavior?: ScrollBehavior) => void;
}

interface MessageItemProps {
  message: UIMessage;
  agent: AgentConfig | null;
}

/**
 * 单条消息渲染组件，Chatbox 风格气泡布局：
 * - 用户消息：蓝色背景右对齐，灰色圆形 "U" 头像
 * - 助手消息：灰色背景左对齐，AgentAvatar 头像，气泡上方展示思考过程
 * - 错误消息：红色背景左对齐
 * hover 时显示复制按钮
 */
const MessageItem: React.FC<MessageItemProps> = ({ message, agent }) => {
  const { t } = useTranslation();
  const isUser = message.type === 'user';
  const isError = message.type === 'error';
  const isAssistant = message.type === 'assistant';

  // App 来源插话内容带来源前缀，与用户消息同一时间线展示
  const displayContent =
    isUser && message.source === 'app' && message.sourceName
      ? `${message.sourceName}：${message.content}`
      : message.content;

  const hasThoughts = message.thoughts && message.thoughts.length > 0;
  const hasContent = displayContent.trim().length > 0;

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

        {/* 气泡：待注入的插话为灰色草稿态，注入时灰转蓝平滑渐变 */}
        {hasContent && (
          <div
            className={cn(
              'px-4 py-2.5 rounded-2xl transition-colors duration-300',
              isUser &&
                (message.queued
                  ? 'bg-muted text-foreground/70'
                  : 'bg-primary text-primary-foreground msg-bubble-user'),
              isError && 'bg-red-50 text-red-900 border border-red-200',
              !isUser && !isError && 'bg-secondary text-foreground'
            )}
          >
            <Markdown content={displayContent} />
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

/** 列表顶部留白，模块级常量保证 Virtuoso components 引用稳定 */
const ListHeader = () => <div className="h-4" />;

interface MessageListProps {
  messages: UIMessage[];
  isLoading?: boolean;
  sessionId: string | null;
  hasAgent?: boolean;
  agent: AgentConfig | null;
  bottomPadding?: number;
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
      sessionId,
      hasAgent = true,
      agent,
      bottomPadding = 0,
    },
    ref
  ) => {
    const { t } = useTranslation();
    const virtuosoRef = useRef<VirtuosoHandle>(null);
    /** 是否停留在列表底部，由 Virtuoso 的 atBottomStateChange 驱动 */
    const [isAtBottom, setIsAtBottom] = useState(true);
    /** isAtBottom 的 ref 镜像，供滚动副作用读取而不进入依赖数组 */
    const isAtBottomRef = useRef(true);

    const handleAtBottomChange = useCallback((atBottom: boolean) => {
      isAtBottomRef.current = atBottom;
      setIsAtBottom(atBottom);
    }, []);

    /**
     * 滚动到最后一条消息的底部
     * - 用 scrollToIndex 而非 scrollTo(top: Infinity)：平滑动画期间虚拟列表
     *   会持续测量新条目改变总高度，后者会停在过时的目标位置，需要多次点击才能到底
     * - Virtuoso 的 behavior 不接受 'instant'，统一映射为 'auto'
     */
    const scrollToBottom = useCallback(
      (behavior: ScrollBehavior = 'instant') => {
        virtuosoRef.current?.scrollToIndex({
          index: 'LAST',
          align: 'end',
          behavior: behavior === 'smooth' ? 'smooth' : 'auto',
        });
      },
      []
    );

    useImperativeHandle(ref, () => ({ scrollToBottom }), [scrollToBottom]);

    /** 滚动到底部按钮点击：平滑滚至底部并记录日志 */
    const handleScrollToBottom = useCallback(() => {
      logger.info('Scroll-to-bottom button clicked');
      scrollToBottom('smooth');
    }, [scrollToBottom]);

    /** 列表底部留白，随 bottomPadding 记忆化，避免每次渲染新对象触发 Virtuoso 重渲染 */
    const ListFooter = useMemo(
      () => () => <div style={{ height: bottomPadding }} />,
      [bottomPadding]
    );

    /** 新消息到达时跟随滚底，仅在已处于底部时跟随，避免回翻历史被拽回底部 */
    useEffect(() => {
      if (!isAtBottomRef.current) return;
      requestAnimationFrame(() => {
        virtuosoRef.current?.scrollToIndex({
          index: 'LAST',
          align: 'end',
          behavior: 'smooth',
        });
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
      <div className="flex-1 min-h-0 relative">
        <Virtuoso
          ref={virtuosoRef}
          style={{ height: '100%' }}
          data={messages}
          followOutput="smooth"
          atBottomThreshold={100}
          atBottomStateChange={handleAtBottomChange}
          {...(hasCachedPosition && cachedPosition
            ? {
                restoreStateFrom: cachedPosition,
                initialScrollTop: cachedPosition.scrollTop,
              }
            : {
                initialTopMostItemIndex: messages.length - 1,
              })}
          increaseViewportBy={{ top: 2000, bottom: 2000 }}
          components={{ Header: ListHeader, Footer: ListFooter }}
          itemContent={(_index, message) => (
            <MessageItem key={message.id} message={message} agent={agent} />
          )}
        />
        <ScrollToBottomButton
          visible={!isAtBottom && messages.length > 0}
          onClick={handleScrollToBottom}
          bottomOffset={bottomPadding}
        />
      </div>
    );
  }
);
