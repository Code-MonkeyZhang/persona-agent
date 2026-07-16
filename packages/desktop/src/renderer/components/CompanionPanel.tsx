/**
 * @file CompanionPanel.tsx - AI 陪伴全屏覆盖面板
 *
 * 以全屏覆盖层的形式展示 AI 陪伴角色，叠加在聊天区域之上。
 * 面板包含：
 * - 背景图 + 角色立绘
 * - 底部 Agent 回复气泡
 * - 底部输入框 + 发送按钮
 *
 * 面板的滑入/滑出动画由 framer-motion 驱动，父组件通过
 * AnimatePresence 控制挂载/卸载，面板根元素 motion.div 提供自动退出动画。
 * 关闭面板由 Header 中的「形象」按钮统一控制，面板内不再提供关闭按钮。
 */
import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Send, ChevronUp, ChevronDown } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { useCompanionStore } from '../stores/companionStore';
import { useChatStore } from '../stores/chatStore';
import { useChatInput } from '../hooks/useChatInput';
import { getPoseImageUrl, getBackgroundImageUrl, listPoses } from '../lib/api';
import { logger } from '../lib/logger';
import { Markdown } from './Markdown';

/**
 * CompanionPanel 组件属性
 * @property agentId - 当前 Agent ID，用于拼接资源 URL；为 null 时不渲染
 * @property onSend - 发送消息回调，复用主聊天区的发送逻辑
 * @property isLoading - 是否正在等待 Agent 回复
 */
interface CompanionPanelProps {
  agentId: string | null;
  onSend: (content: string) => void;
  isLoading: boolean;
}

/**
 * CompanionPanel 全屏覆盖面板组件，叠加在聊天区域之上展示 AI 陪伴角色
 * 滑入/滑出动画由 framer-motion 管理，父组件通过 AnimatePresence 控制退出。
 * @param props.agentId - 当前 Agent ID，为 null 时不渲染
 * @param props.onSend - 发送消息回调，复用主聊天区的发送逻辑
 * @param props.isLoading - 是否正在等待 Agent 回复
 */
export function CompanionPanel({
  agentId,
  onSend,
  isLoading,
}: CompanionPanelProps) {
  const { t } = useTranslation();
  const currentPose = useCompanionStore((s) => s.currentPose);
  const animatePose = useCompanionStore((s) => s.animatePose);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const messages = useChatStore((s) =>
    currentSessionId
      ? (s.sessionStates.get(currentSessionId)?.messages ?? [])
      : []
  );
  const [bgError, setBgError] = useState(false);
  const [poseError, setPoseError] = useState(false);
  const [hasAssets, setHasAssets] = useState<boolean | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const bubbleRef = useRef<HTMLDivElement>(null);

  /** 立绘 URL，存入 state 避免每次 re-render 因 cache-buster 重新请求 */
  const [poseUrl, setPoseUrl] = useState('');

  const {
    input: inputText,
    textareaRef,
    handleChange,
    handleKeyDown,
    reset,
  } = useChatInput({
    maxHeight: 120,
    onSend: () => {
      const text = inputText.trim();
      if (text && !isLoading) {
        onSend(text);
        reset();
      }
    },
  });

  /**
   * 挂载时检测该 Agent 是否有立绘资源。
   * - hasAssets 决定面板显示资源态还是空态
   * - pose 的初始值由 App.tsx 在切 session 时统一回填
   */
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setBgError(false);
    setPoseError(false);
    setHasAssets(null);
    listPoses(agentId)
      .then((poses) => {
        if (cancelled) return;
        setHasAssets(poses.length > 0);
      })
      .catch(() => {
        if (!cancelled) setHasAssets(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  /** currentPose 变化时清除加载错误，确保切换立绘后能重新尝试渲染 */
  useEffect(() => {
    setPoseError(false);
  }, [currentPose]);

  /** currentPose 或 agentId 变化时更新立绘 URL */
  useEffect(() => {
    if (!agentId) return;
    setPoseUrl(getPoseImageUrl(agentId, currentPose));
    if (animatePose) {
      logger.info(`[CompanionPanel] cross-fade pose: ${currentPose}`);
    }
  }, [currentPose, agentId]);

  /**
   * 从全局聊天消息流中倒序查找最后一条 assistant 类型的消息，
   * 用于在面板底部回复气泡中展示。messages 变化时自动重新计算。
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

  if (!agentId) return null;

  if (hasAssets === false) {
    return (
      <motion.div
        className="absolute inset-0 z-30 flex flex-col h-full"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        initial={{ x: '100%' }}
        animate={{ x: 0, transition: { duration: 0.3, ease: 'easeOut' } }}
        exit={{ x: '100%', transition: { duration: 0.2, ease: 'easeIn' } }}
      >
        <div className="absolute inset-0 bg-muted" />
        <div className="relative z-10 flex-1 flex items-center justify-center px-8">
          <div className="text-center">
            <p className="text-[18px] font-medium text-muted-foreground leading-relaxed">
              {t('companion.noAppearance')}
            </p>
            <p className="text-[14px] text-muted-foreground mt-3 leading-relaxed">
              {t('companion.uploadPoseHint')}
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="absolute inset-0 z-30 flex flex-col h-full"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      initial={{ x: '100%' }}
      animate={{ x: 0, transition: { duration: 0.3, ease: 'easeOut' } }}
      exit={{ x: '100%', transition: { duration: 0.2, ease: 'easeIn' } }}
    >
      {hasAssets === null || bgError ? (
        <div className="absolute inset-0 bg-muted" />
      ) : (
        <img
          src={getBackgroundImageUrl(agentId)}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setBgError(true)}
        />
      )}

      {hasAssets === true && !poseError && poseUrl && (
        <AnimatePresence mode="sync">
          <motion.img
            key={currentPose}
            src={poseUrl}
            alt=""
            className="absolute bottom-0 left-1/2 -translate-x-1/2 z-[1] h-[85%] object-contain object-bottom translate-y-[-8%]"
            initial={{ opacity: animatePose ? 0 : 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: animatePose ? 0 : 1 }}
            transition={{ duration: animatePose ? 0.3 : 0, ease: 'linear' }}
            onError={() => setPoseError(true)}
          />
        </AnimatePresence>
      )}
      {hasAssets === true && poseError && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-[14px] text-muted-foreground">
            {t('companion.poseLoadError')}
          </p>
        </div>
      )}

      <div className="relative z-10 flex-1" />

      {lastAgentMessage && (
        <motion.div
          key={lastAgentMessage.id}
          className="z-10 shrink-0 px-5 pb-3"
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
      )}

      <div className="relative z-10 shrink-0 px-5 pb-5">
        <div className="rounded-[24px] p-4 bg-white/80 backdrop-blur-md border border-white/50 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            placeholder={t('companion.inputPlaceholder')}
            rows={1}
            className="w-full resize-none bg-transparent text-[15px] text-foreground placeholder:text-muted-foreground focus-visible:outline-none max-h-[120px]"
          />
          <div className="flex items-center justify-end mt-3">
            <button
              onClick={() => {
                const text = inputText.trim();
                if (text && !isLoading) {
                  onSend(text);
                  reset();
                }
              }}
              disabled={!inputText.trim() || isLoading}
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                inputText.trim() && !isLoading
                  ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                  : 'bg-muted text-white'
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
