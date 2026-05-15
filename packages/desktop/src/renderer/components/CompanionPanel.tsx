/**
 * @file CompanionPanel.tsx - AI 陪伴全屏覆盖面板
 *
 * 以全屏覆盖层的形式展示 AI 陪伴角色，叠加在聊天区域之上。
 * 面板包含：
 * - 背景图 + 角色立绘（支持表情切换）
 * - 顶部关闭按钮（毛玻璃风格）
 * - 底部 Agent 回复气泡（显示最后一条 assistant 消息，带入场动画，上下箭头指示溢出）
 * - 底部输入框 + 发送按钮（毛玻璃风格，直接调用主聊天发送逻辑）
 */
import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { Send, X, ChevronUp, ChevronDown, Speech } from 'lucide-react';
import { useCompanionStore } from '../stores/companionStore';
import { useChatStore } from '../stores/chatStore';
import { useVoiceStore } from '../stores/voiceStore';
import { useAgentStore } from '../stores/agentStore';
import { getPoseImageUrl, getBackgroundImageUrl, listPoses } from '../lib/api';
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
 * @param props.agentId - 当前 Agent ID，为 null 时不渲染
 * @param props.onSend - 发送消息回调，复用主聊天区的发送逻辑
 * @param props.isLoading - 是否正在等待 Agent 回复
 */
export function CompanionPanel({
  agentId,
  onSend,
  isLoading,
}: CompanionPanelProps) {
  const currentPose = useCompanionStore((s) => s.currentPose);
  const toggleVisible = useCompanionStore((s) => s.toggleVisible);
  const messages = useChatStore((s) => s.messages);
  const voiceEnabled = useVoiceStore((s) => s.voiceEnabled);
  const toggleVoice = useVoiceStore((s) => s.toggleVoice);
  const stopSpeaking = useVoiceStore((s) => s.stopSpeaking);
  const currentAgent = useAgentStore((s) => s.currentAgent);
  const voiceConfigured = !!currentAgent?.voiceId;
  const [inputText, setInputText] = useState('');
  const [bgError, setBgError] = useState(false);
  const [poseError, setPoseError] = useState(false);
  const [hasAssets, setHasAssets] = useState<boolean | null>(null);
  const [canScrollUp, setCanScrollUp] = useState(false);
  const [canScrollDown, setCanScrollDown] = useState(false);
  const [showVoiceToast, setShowVoiceToast] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);

  /**
   * 挂载时检测该 Agent 是否有姿态资源，
   * 结果存储到 hasAssets 状态中（null=加载中, false=无资源, true=有资源）
   */
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setHasAssets(null);
    listPoses(agentId)
      .then((poses) => {
        if (!cancelled) setHasAssets(poses.length > 0);
      })
      .catch(() => {
        if (!cancelled) setHasAssets(false);
      });
    return () => {
      cancelled = true;
    };
  }, [agentId]);

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

  /** 输入框内容变化时同步状态，并自动调整 textarea 高度（上限 120px） */
  const handleInput = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInputText(e.target.value);
      const ta = e.target;
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 120) + 'px';
    },
    []
  );

  /** 点击发送或回车发送，清空输入框并重置 textarea 高度 */
  const handleSend = useCallback(() => {
    const text = inputText.trim();
    if (!text || isLoading) return;
    onSend(text);
    setInputText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [inputText, isLoading, onSend]);

  /** Enter 发送，Shift+Enter 换行 */
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.nativeEvent.isComposing) return;
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  /**
   * 语音开关按钮点击处理：
   * - 未配置音色 → 弹 toast 提示
   * - 已开启 → 先停掉当前播放，再切换为关闭
   * - 已关闭 → 直接切换为开启
   */
  const handleVoiceToggle = useCallback(() => {
    if (!voiceConfigured) {
      setShowVoiceToast(true);
      setTimeout(() => setShowVoiceToast(false), 2000);
      return;
    }
    if (voiceEnabled) {
      stopSpeaking();
    }
    toggleVoice();
  }, [voiceConfigured, voiceEnabled, stopSpeaking, toggleVoice]);

  /** 根据气泡容器的滚动位置更新 canScrollUp / canScrollDown 状态（1px 容差避免浮点精度问题） */
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
      <div className="absolute inset-0 flex flex-col animate-companion-slide-in z-30">
        <div className="absolute inset-0 bg-gradient-to-b from-gray-100 to-gray-300" />
        <div className="relative z-10 flex items-center justify-between px-4 pt-4 pb-2">
          <button
            onClick={toggleVisible}
            className="w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm border border-white/50 flex items-center justify-center shadow-[0_2px_12px_rgba(0,0,0,0.08)] text-[#333] hover:bg-white/90 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="relative z-10 flex-1 flex items-center justify-center px-8">
          <div className="text-center">
            <p className="text-[18px] font-medium text-[#555] leading-relaxed">
              该 Agent 还未配置陪伴形象
            </p>
            <p className="text-[14px] text-[#999] mt-3 leading-relaxed">
              在 assets/pose/ 目录下添加表情图片即可启用
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 flex flex-col animate-companion-slide-in z-30">
      {hasAssets === null || bgError ? (
        <div className="absolute inset-0 bg-gradient-to-b from-gray-100 to-gray-300" />
      ) : (
        <img
          src={getBackgroundImageUrl(agentId)}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setBgError(true)}
        />
      )}

      {hasAssets === true && !poseError && (
        <img
          src={getPoseImageUrl(agentId, currentPose)}
          alt=""
          className="absolute bottom-0 left-1/2 -translate-x-1/2 z-[1] h-[85%] object-contain object-bottom translate-y-[-8%]"
          onError={() => setPoseError(true)}
        />
      )}

      <div className="relative z-10 flex items-center justify-between px-4 pt-4 pb-2">
        <button
          onClick={toggleVisible}
          className="w-9 h-9 rounded-full bg-white/80 backdrop-blur-sm border border-white/50 flex items-center justify-center shadow-[0_2px_12px_rgba(0,0,0,0.08)] text-[#333] hover:bg-white/90 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
        <button
          onClick={handleVoiceToggle}
          disabled={!voiceConfigured}
          className={`w-9 h-9 rounded-full backdrop-blur-2xl border flex items-center justify-center shadow-[0_2px_12px_rgba(0,0,0,0.08)] transition-colors ${
            !voiceConfigured
              ? 'bg-white/80 border-white/30 text-[#999] cursor-not-allowed opacity-60'
              : voiceEnabled
                ? 'bg-white/80 border-white/60 text-[#333]'
                : 'bg-white/40 border-white/50 text-[#333] hover:bg-white/80'
          }`}
        >
          {voiceEnabled && voiceConfigured ? (
            <Speech className="w-4 h-4" />
          ) : (
            <Speech className="w-4 h-4 opacity-40" />
          )}
        </button>
      </div>

      <div className="relative z-10 flex-1" />

      {lastAgentMessage && (
        <div
          key={lastAgentMessage.id}
          className="z-10 shrink-0 px-5 pb-3 animate-companion-bubble-in"
        >
          {lastAgentMessage.content.trim().length > 0 ? (
            <div className="relative overflow-hidden rounded-[24px] bg-white/80 backdrop-blur-md border border-white/50 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
              <div
                ref={bubbleRef}
                onScroll={updateScrollState}
                className="companion-scroll-hidden px-4 pt-7 pb-7 max-h-[160px] overflow-y-auto text-[14px] text-[#333] leading-relaxed"
              >
                <Markdown content={lastAgentMessage.content} />
              </div>
              {canScrollUp && (
                <div className="absolute top-1 left-1/2 -translate-x-1/2 pointer-events-none">
                  <ChevronUp className="w-5 h-5 text-[#333] drop-shadow-[0_1px_2px_rgba(0,0,0,0.1)]" />
                </div>
              )}
              {canScrollDown && (
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 pointer-events-none">
                  <ChevronDown className="w-5 h-5 text-[#333] drop-shadow-[0_1px_2px_rgba(0,0,0,0.1)]" />
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-[24px] bg-white/80 backdrop-blur-md border border-white/50 shadow-[0_2px_12px_rgba(0,0,0,0.08)] px-4 py-2 text-[13px] text-[#999] animate-pulse text-center">
              思考中...
            </div>
          )}
        </div>
      )}

      <div className="relative z-10 shrink-0 px-5 pb-5">
        <div className="rounded-[24px] p-4 bg-white/80 backdrop-blur-md border border-white/50 shadow-[0_2px_12px_rgba(0,0,0,0.08)]">
          <textarea
            ref={textareaRef}
            value={inputText}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="输入信息..."
            rows={1}
            className="w-full resize-none bg-transparent text-[15px] text-[#333] placeholder:text-[#999] focus-visible:outline-none max-h-[120px]"
          />
          <div className="flex items-center justify-end mt-3">
            <button
              onClick={handleSend}
              disabled={!inputText.trim() || isLoading}
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                inputText.trim() && !isLoading
                  ? 'bg-[#228be6] text-white hover:bg-[#1a7ad4]'
                  : 'bg-[#d8d8d8] text-white'
              }`}
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {showVoiceToast && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 px-4 py-2 rounded-full bg-black/70 text-white text-[13px] whitespace-nowrap">
          请先在 Agent 编辑器中配置音色
        </div>
      )}
    </div>
  );
}
