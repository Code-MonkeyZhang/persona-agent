/**
 * @file CompanionContent.tsx - AI 陪伴展示 pane
 *
 * 作为聊天视图右侧 pane 渲染，仅展示背景图、角色立绘与空态。
 * 不包含输入框与回复气泡，那些由外层浮层统一承载。
 * 立绘 cross-fade 动画由 framer-motion 驱动，currentPose 作为 motion.img 的 key。
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useCompanionStore } from '../stores/companionStore';
import { getPoseImageUrl, getBackgroundImageUrl, listPoses } from '../lib/api';
import { logger } from '../lib/logger';

interface CompanionContentProps {
  agentId: string | null;
}

/**
 * 陪伴内容展示 pane，渲染背景图、立绘与空态
 * @param props.agentId - 当前 Agent ID，为 null 时直接返回 null
 */
export function CompanionContent({ agentId }: CompanionContentProps) {
  const { t } = useTranslation();
  const currentPose = useCompanionStore((s) => s.currentPose);
  const animatePose = useCompanionStore((s) => s.animatePose);
  const [bgError, setBgError] = useState(false);
  const [poseError, setPoseError] = useState(false);
  const [hasAssets, setHasAssets] = useState<boolean | null>(null);

  /** 立绘 URL，存入 state 避免每次 re-render 因 cache-buster 重新请求 */
  const [poseUrl, setPoseUrl] = useState('');

  /**
   * 挂载时检测该 Agent 是否有立绘资源。
   * - hasAssets 决定 pane 显示资源态还是空态
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
      logger.info(`[CompanionContent] cross-fade pose: ${currentPose}`);
    }
  }, [currentPose, agentId, animatePose]);

  if (!agentId) return null;

  if (hasAssets === false) {
    return (
      <div
        className="relative h-full w-full overflow-hidden bg-muted"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <div className="flex h-full items-center justify-center px-8">
          <div className="text-center">
            <p className="text-[18px] font-medium text-muted-foreground leading-relaxed">
              {t('companion.noAppearance')}
            </p>
            <p className="text-[14px] text-muted-foreground mt-3 leading-relaxed">
              {t('companion.uploadPoseHint')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
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
    </div>
  );
}
