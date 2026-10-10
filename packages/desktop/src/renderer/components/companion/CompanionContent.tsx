/**
 * @file src/renderer/components/companion/CompanionContent.tsx - AI 陪伴展示 pane
 *
 * 作为聊天视图右侧 pane 渲染，仅展示背景图、角色立绘与空态。
 * 不包含输入框与回复气泡，那些由外层浮层统一承载。
 * 立绘 cross-fade 动画由 framer-motion 驱动，currentPose 作为 motion.img 的 key。
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import { useCompanionStore } from '../../stores/companionStore';
import {
  getPoseImageUrl,
  getBackgroundImageUrl,
  listPoses,
  type PoseAsset,
} from '../../lib/api';
import { logger } from '../../lib/logger';

interface CompanionContentProps {
  agentId: string | null;
}

/** 立绘清单转名字到内容哈希的映射 */
function buildPoseMap(poses: PoseAsset[]): Record<string, string> {
  return Object.fromEntries(poses.map((p) => [p.name, p.hash]));
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

  /** 立绘与背景 URL 基于内容哈希拼装，存入 state 保持地址稳定 */
  const [poseUrl, setPoseUrl] = useState('');
  const [bgUrl, setBgUrl] = useState('');
  /** 名字到内容哈希的映射，来自素材列表响应 */
  const [poseHashMap, setPoseHashMap] = useState<Record<string, string>>({});

  /**
   * 挂载时拉取素材清单。
   * - hasAssets 决定 pane 显示资源态还是空态
   * - 背景地址由响应里的 backgroundHash 拼装，无背景时留空走纯色底
   * - pose 的初始值由 App.tsx 在切 session 时统一回填
   */
  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setBgError(false);
    setPoseError(false);
    setHasAssets(null);
    setPoseUrl('');
    setBgUrl('');
    setPoseHashMap({});
    listPoses(agentId)
      .then(({ poses, backgroundHash }) => {
        if (cancelled) return;
        setHasAssets(poses.length > 0);
        setPoseHashMap(buildPoseMap(poses));
        setBgUrl(
          backgroundHash ? getBackgroundImageUrl(agentId, backgroundHash) : ''
        );
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

  /**
   * 按哈希映射拼立绘地址。
   * 映射缺失说明该姿势在清单拉取之后新增，重拉一次清单补哈希，
   * 不拼无哈希地址避免污染永久缓存，重拉后仍缺则按加载失败处理。
   */
  useEffect(() => {
    if (!agentId || hasAssets !== true) return;
    const hash = poseHashMap[currentPose];
    if (hash) {
      setPoseUrl(getPoseImageUrl(agentId, currentPose, hash));
      if (animatePose) {
        logger.info(`[CompanionContent] cross-fade pose: ${currentPose}`);
      }
      return;
    }
    logger.info(
      `[CompanionContent] pose hash missing, refetch list for: ${currentPose}`
    );
    let cancelled = false;
    listPoses(agentId)
      .then(({ poses }) => {
        if (cancelled) return;
        const found = poses.find((p) => p.name === currentPose);
        if (found) {
          setPoseHashMap(buildPoseMap(poses));
          setPoseUrl(getPoseImageUrl(agentId, currentPose, found.hash));
        } else {
          setPoseError(true);
        }
      })
      .catch(() => {
        if (!cancelled) setPoseError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPose, agentId, poseHashMap, hasAssets, animatePose]);

  if (!agentId) return null;

  if (hasAssets === false) {
    return (
      <div
        className="relative h-full w-full overflow-hidden bg-muted"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
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

  return (
    <div
      className="relative h-full w-full overflow-hidden"
      style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
    >
      {hasAssets === null || bgError || !bgUrl ? (
        <div className="absolute inset-0 bg-muted" />
      ) : (
        <img
          src={bgUrl}
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
          <p className="text-content text-muted-foreground">
            {t('companion.poseLoadError')}
          </p>
        </div>
      )}
    </div>
  );
}
