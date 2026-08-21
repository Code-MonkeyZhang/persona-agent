/**
 * @file src/renderer/components/companion/CompanionReplyBubble.tsx - 陪伴态回复气泡
 *
 * 展示当前会话最近一条 assistant 消息，渲染在浮层 InputBox 的正上方。
 * 无 assistant 消息时返回 null；assistant 消息内容为空时显示 thinking 占位。
 * 气泡内容超过最大高度时内部滚动，并在上下边缘显示箭头提示。
 */
import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../stores/chatStore';
import { Markdown } from '../common/Markdown';

interface CompanionReplyBubbleProps {
  agentId: string | null;
}

/**
 * 陪伴态回复气泡，从全局消息流倒序查找最后一条 assistant 消息并展示
 * @param _agentId - 当前 Agent ID，当前未使用，预留扩展接口
 */
export function CompanionReplyBubble({
  agentId: _agentId,
}: CompanionReplyBubbleProps) {
  const { t } = useTranslation();
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const messages = useChatStore((s) =>
    currentSessionId
      ? (s.sessionStates.get(currentSessionId)?.messages ?? [])
      : []
  );
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);

  /**
   * 从全局聊天消息流中倒序查找最后一条 assistant 类型的消息，
   * 用于在气泡中展示。messages 变化时自动重新计算。
   */
  const lastAgentMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].type === 'assistant') return messages[i];
    }
    return null;
  }, [messages]);

  /** 根据气泡容器的滚动位置更新 canScrollUp / canScrollDown 状态 */
  const updateScrollState = useCallback(() => {
    const el = bubbleRef.current;
    if (!el) return;
    setCanScrollUp(el.scrollTop > 1);
    setCanScrollDown(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
  }, []);

  /** 消息变化后延迟一帧检测滚动状态，确保内容渲染完毕再判断是否溢出 */
  useEffect(() => {
    requestAnimationFrame(updateScrollState);
  }, [lastAgentMessage, updateScrollState]);

  if (!lastAgentMessage) return null;

  return (
    <motion.div
      key={lastAgentMessage.id}
      className="px-4 pb-2 shrink-0"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      {lastAgentMessage.content.trim().length > 0 ? (
        <div className="relative overflow-hidden rounded-[24px] bg-white/80 backdrop-blur-md border border-white/50 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
          <div
            ref={bubbleRef}
            onScroll={updateScrollState}
            className="companion-scroll-hidden px-4 pt-7 pb-7 max-h-[160px] overflow-y-auto text-[14px] text-foreground leading-relaxed"
          >
            <Markdown content={lastAgentMessage.content} />
          </div>
          {canScrollUp && (
            <div className="absolute top-1 left-1/2 -translate-x-1/2 pointer-events-none">
              <ChevronUp className="w-5 h-5 text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.1)]" />
            </div>
          )}
          {canScrollDown && (
            <div className="absolute bottom-1 left-1/2 -translate-x-1/2 pointer-events-none">
              <ChevronDown className="w-5 h-5 text-foreground drop-shadow-[0_1px_2px_rgba(0,0,0,0.1)]" />
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-[24px] bg-white/80 backdrop-blur-md border border-white/50 shadow-[0_2px_12px_rgba(0,0,0,0.08)] px-4 py-2 text-[13px] text-muted-foreground animate-pulse text-center">
          {t('companion.thinking')}
        </div>
      )}
    </motion.div>
  );
}
