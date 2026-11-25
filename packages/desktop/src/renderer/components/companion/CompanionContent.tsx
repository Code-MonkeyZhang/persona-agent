/**
 * @file src/renderer/components/companion/CompanionContent.tsx - AI 陪伴展示 pane
 *
 * 作为聊天视图右侧 pane 渲染四层舞台：背景图、外层身体动作、中层呼吸、内层双图层换脸、独立气泡层。
 * 不包含输入框与回复气泡，那些由外层浮层统一承载。
 * 换脸的门控、竞态保护与回退逻辑都在 performanceStore 的引擎里，本组件只按 state 渲染。
 * 气泡层的思考气泡由生成相位驱动，本组件订阅当前会话的实时状态与思考气泡开关推进引擎，是相位进入引擎的唯一桥接。
 */
import { useLayoutEffect, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MOTION_NAMES, type AgentConfig } from '@persona/shared';
import { cn } from '../../lib/utils';
import { EFFECT_URLS } from '../../assets/effects';
import { usePerformanceStore } from '../../stores/performanceStore';
import { useSettingsStore } from '../../stores/settingsStore';
import { useChatStore } from '../../stores/chatStore';
import { deriveLivePhase } from '../chat/LiveStrip';

interface CompanionContentProps {
  agent: AgentConfig | null;
}

/** 动作层的类名清单，重播前整体摘掉 */
const MOTION_CLASSES = MOTION_NAMES.map((name) => `perf-run-${name}`);

const NO_DRAG = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

/**
 * 陪伴内容展示 pane，渲染背景图、四层舞台与空态
 * @param props.agent - 当前 Agent，为 null 时直接返回 null，气泡偏移取它的两个微调字段
 */
export function CompanionContent({ agent }: CompanionContentProps) {
  const { t } = useTranslation();
  const assets = usePerformanceStore((s) => s.assets);
  const layers = usePerformanceStore((s) => s.layers);
  const active = usePerformanceStore((s) => s.active);
  const aspect = usePerformanceStore((s) => s.aspect);
  const instant = usePerformanceStore((s) => s.instant);
  const failed = usePerformanceStore((s) => s.failed);
  const motion = usePerformanceStore((s) => s.motion);
  const bubble = usePerformanceStore((s) => s.bubble);
  const bindAgent = usePerformanceStore((s) => s.bindAgent);
  const motionEnded = usePerformanceStore((s) => s.motionEnded);
  const setPhase = usePerformanceStore((s) => s.setPhase);
  const setThinkingEnabled = usePerformanceStore((s) => s.setThinkingEnabled);
  const breathEnabled = useSettingsStore((s) => s.breathEnabled);
  const thinkingEnabled = useSettingsStore((s) => s.thinkingBubbleEnabled);
  const currentSessionId = useChatStore((s) => s.currentSessionId);
  const liveRun = useChatStore((s) =>
    currentSessionId
      ? (s.sessionStates.get(currentSessionId)?.liveRun ?? null)
      : null
  );
  const [bgError, setBgError] = useState(false);
  const motionRef = useRef<HTMLDivElement>(null);

  /** 挂载或换 Agent 时拉清单，assets 决定 pane 显示资源态还是空态 */
  useEffect(() => {
    setBgError(false);
    bindAgent(agent?.id ?? null);
  }, [agent?.id, bindAgent]);

  /** 相位推进引擎，思考气泡随之出入场，用 layout effect 是切会话时它要赶在绘制前与瞬切对齐 */
  useLayoutEffect(() => {
    setPhase(deriveLivePhase(liveRun));
  }, [liveRun, setPhase]);

  /** 思考气泡开关注入引擎，运行中拨动立即生效 */
  useLayoutEffect(() => {
    setThinkingEnabled(thinkingEnabled);
  }, [thinkingEnabled, setThinkingEnabled]);

  /** 舞台卸载时相位归空闲，思考气泡随之收起，清理函数只在卸载时运行，不随相位变化触发 */
  useLayoutEffect(() => () => setPhase('idle'), [setPhase]);

  /** 动作重播：清类强制 reflow 再上类，同一动作连点从头播，归位时清干净命令式类 */
  useEffect(() => {
    const el = motionRef.current;
    if (!el) return;
    el.classList.remove(...MOTION_CLASSES);
    if (!motion.name) return;
    void el.offsetWidth;
    el.classList.add(`perf-run-${motion.name}`);
  }, [motion.key, motion.name]);

  if (!agent) return null;

  if (assets?.hasPoses === false) {
    return (
      <div
        className="relative h-full w-full overflow-hidden bg-muted"
        style={NO_DRAG}
      >
        <div className="flex h-full items-center justify-center px-8">
          <div className="text-center">
            <p className="text-title-display font-semibold text-muted-foreground leading-relaxed">
              {t('companion.noAppearance')}
            </p>
            <p className="text-content text-muted-foreground mt-3 leading-relaxed">
              {t('companion.uploadPoseHint')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const showStage = !failed && layers.a !== '';

  return (
    <div className="relative h-full w-full overflow-hidden" style={NO_DRAG}>
      {assets === null || bgError || !assets.bgUrl ? (
        <div className="absolute inset-0 bg-muted" />
      ) : (
        <img
          src={assets.bgUrl}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          onError={() => setBgError(true)}
        />
      )}

      {showStage && (
        /* 立绘挂载点：高度 85% 宽度随宽高比，自身即立绘包围盒，气泡锚它的左上角 */
        <div
          className="absolute bottom-0 left-1/2 -translate-x-1/2 z-[1] h-[85%] max-w-full translate-y-[-8%]"
          style={{ aspectRatio: aspect }}
        >
          {/* 外层身体动作，one-shot 播完归位 */}
          <div
            ref={motionRef}
            className="perf-motion absolute inset-0"
            onAnimationEnd={(e) => {
              if (e.target === e.currentTarget) motionEnded();
            }}
          >
            {/* 中层呼吸，缩放原点顶部中心，关闭后立绘完全静止 */}
            <div
              className={cn(
                'perf-breath absolute inset-0',
                breathEnabled && 'perf-breath-on'
              )}
            >
              {/* 内层换脸，双图层叠放交叉淡化 300ms linear */}
              <div
                className={cn(
                  'perf-pose absolute inset-0',
                  active === 'a' && 'perf-pose-on',
                  instant && 'perf-pose-instant'
                )}
              >
                <img src={layers.a} alt="" />
              </div>
              <div
                className={cn(
                  'perf-pose absolute inset-0',
                  active === 'b' && 'perf-pose-on',
                  instant && 'perf-pose-instant'
                )}
              >
                {layers.b && <img src={layers.b} alt="" />}
              </div>
            </div>
          </div>
          {/* 气泡独立一层，不挂动作层里，立绘跳的时候气泡不动，偏移是挂载点宽高的百分比 */}
          {bubble.name && (
            <div
              className={cn('perf-bubble', bubble.shown && 'perf-bubble-show')}
              style={{
                left: `${agent.bubbleOffsetX ?? 0}%`,
                top: `${agent.bubbleOffsetY ?? 0}%`,
              }}
            >
              {/* 地址拼上 key 让每次出泡是一份新的地址，同一地址的动态图重挂后停在上一轮末帧不再播 */}
              <img
                key={bubble.key}
                src={`${EFFECT_URLS[bubble.name]}?k=${bubble.key}`}
                alt=""
              />
            </div>
          )}
        </div>
      )}
      {failed && (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-content text-muted-foreground">
            {t('companion.poseLoadError')}
          </p>
        </div>
      )}
    </div>
  );
}
