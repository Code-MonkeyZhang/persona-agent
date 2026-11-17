/**
 * @file src/renderer/components/companion/CompanionReplyBubble.tsx - 陪伴态回复气泡
 *
 * 展示当前会话最近一条正文非空的 assistant 消息，渲染在浮层 InputBox 的正上方。
 * 运行期由时间线同一份 liveRun 驱动，框内一次只显一条动向居中整句替换，
 * 失败步红字不带圆点，轮末 liveRun 清空落回正文。
 * 空闲期倒序回退到最近一条正文非空的 assistant 消息，空正文的纯工具轮与中止轮被跳过。
 * 整个会话无非空回复且非运行期时返回 null，立绘与输入框直接相邻。
 * 气泡内容超过最大高度时内部滚动，上下边缘由遮罩渐隐提示可滚方向。
 */
import { useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../../stores/chatStore';
import { useScrollFade } from '../../hooks/useScrollFade';
import { logger } from '../../lib/logger';
import { Dots, liveRunLabel, phaseIcon } from '../chat/LiveStrip';
import { Markdown } from '../common/Markdown';
import type { UIMessage } from '../../types/chat';

interface CompanionReplyBubbleProps {
  agentId: string | null;
}

/** 气泡渐隐区高度，气泡高 160 比 Select 下拉更紧凑，取值低于 Select 的 32 */
const COMPANION_FADE_SIZE = 24;

/**
 * 倒序查找最近一条正文非空的 assistant 消息。
 * 纯工具轮与无半截正文的中止轮落盘的 assistant 消息正文为空串，查找时跳过，
 * 整个消息流没有非空回复时返回 null。
 */
export function lastRepliedMessage(messages: UIMessage[]): UIMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    if (message.type === 'assistant' && message.content.trim().length > 0) {
      return message;
    }
  }
  return null;
}

/**
 * 陪伴态回复气泡，从全局消息流倒序查找最近一条正文非空的 assistant 消息并展示
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
  // 运行期动向与顶栏时间线同源，liveRun 在位时框内只显当前这一步
  const liveRun = useChatStore((s) =>
    currentSessionId
      ? (s.sessionStates.get(currentSessionId)?.liveRun ?? null)
      : null
  );
  const { scrollRef, maskImage } = useScrollFade(COMPANION_FADE_SIZE);

  /**
   * 从全局聊天消息流中倒序查找最近一条正文非空的 assistant 消息，
   * 空正文的纯工具轮与中止轮被跳过。messages 变化时自动重新计算。
   */
  const lastAgentMessage = useMemo(
    () => lastRepliedMessage(messages),
    [messages]
  );

  // 每步动向进框时留一条日志，陪伴态反馈缺失时可据此排查数据链路
  useEffect(() => {
    if (liveRun) {
      logger.info(
        `[CompanionReplyBubble] live动向: ${liveRunLabel(t, liveRun)}`
      );
    }
  }, [liveRun, t]);

  // 空闲回退目标变化时留一条日志，轮末气泡未回退时可据此排查查找链路
  useEffect(() => {
    if (lastAgentMessage) {
      logger.info(`[CompanionReplyBubble] idle回退: ${lastAgentMessage.id}`);
    }
  }, [lastAgentMessage]);

  // 运行期动向行优先于上一轮正文，整行居中一次一条，失败步红字不带圆点
  if (liveRun) {
    const failed = !!liveRun.steps[liveRun.steps.length - 1]?.failed;
    const label = liveRunLabel(t, liveRun);
    const PhaseIcon = phaseIcon(liveRun);
    return (
      <motion.div
        className="px-4 pb-2 shrink-0"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
      >
        <div className="flex h-11 items-center justify-center gap-2 rounded-[24px] bg-white/80 backdrop-blur-md border border-white/50 shadow-[0_2px_12px_rgba(0,0,0,0.08)] px-4">
          <PhaseIcon className="w-[13px] h-[13px] text-primary shrink-0" />
          <span
            className={`min-w-0 text-caption truncate ${
              failed
                ? 'font-semibold text-[#d5392e]'
                : 'font-medium text-foreground'
            }`}
          >
            {label}
          </span>
          {!failed && <Dots />}
        </div>
      </motion.div>
    );
  }

  if (!lastAgentMessage) return null;

  return (
    <motion.div
      key={lastAgentMessage.id}
      className="px-4 pb-2 shrink-0"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <div className="relative overflow-hidden rounded-[24px] bg-white/80 backdrop-blur-md border border-white/50 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
        <div
          ref={scrollRef}
          style={{ maskImage, WebkitMaskImage: maskImage }}
          className="scroll-hidden px-4 pt-7 pb-7 max-h-[160px] overflow-y-auto text-content text-foreground leading-relaxed"
        >
          <Markdown content={lastAgentMessage.content} />
        </div>
      </div>
    </motion.div>
  );
}
