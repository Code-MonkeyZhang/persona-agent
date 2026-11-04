/**
 * @file src/renderer/components/companion/CompanionReplyBubble.tsx - 陪伴态回复气泡
 *
 * 展示当前会话最近一条 assistant 消息，渲染在浮层 InputBox 的正上方。
 * 无 assistant 消息时返回 null；assistant 消息内容为空时显示 thinking 占位。
 * 气泡内容超过最大高度时内部滚动，上下边缘由遮罩渐隐提示可滚方向。
 */
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../stores/chatStore';
import { useScrollFade } from '../../hooks/useScrollFade';
import { Markdown } from '../common/Markdown';

interface CompanionReplyBubbleProps {
  agentId: string | null;
}

/** 气泡渐隐区高度，气泡高 160 比 Select 下拉更紧凑，取值低于 Select 的 32 */
const COMPANION_FADE_SIZE = 24;

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
  const { scrollRef, maskImage } = useScrollFade(COMPANION_FADE_SIZE);

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
            ref={scrollRef}
            style={{ maskImage, WebkitMaskImage: maskImage }}
            className="scroll-hidden px-4 pt-7 pb-7 max-h-[160px] overflow-y-auto text-content text-foreground leading-relaxed"
          >
            <Markdown content={lastAgentMessage.content} />
          </div>
        </div>
      ) : (
        <div className="rounded-[24px] bg-white/80 backdrop-blur-md border border-white/50 shadow-[0_2px_12px_rgba(0,0,0,0.08)] px-4 py-2 text-body text-muted-foreground animate-pulse text-center">
          {t('companion.thinking')}
        </div>
      )}
    </motion.div>
  );
}
