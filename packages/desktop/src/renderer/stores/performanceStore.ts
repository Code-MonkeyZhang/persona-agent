/**
 * @file 陪伴演出状态库，PerformanceEngine 的 zustand 薄绑定与桌面端的依赖装配
 * 取图走 api 的哈希链路，立绘清单按 Agent 缓存，组件的资源就绪态与引擎的取图共用这一份清单
 * 门控用离屏 Image 的 decode，气泡是渲染层包内资源按名直取，不碰网络
 */
import { create } from 'zustand';
import type { BubbleName, ShowPoseParams } from '@persona/shared';
import {
  getBackgroundImageUrl,
  getPoseImageUrl,
  listPoses,
  type PoseAssets,
} from '../lib/api';
import { logger } from '../lib/logger';
import { EFFECT_URLS } from '../assets/effects';
import {
  INITIAL_STATE,
  PerformanceEngine,
  type GeneratingPhase,
  type PerformanceLog,
  type PerformanceState,
} from './performanceEngine';
import { useAgentStore } from './agentStore';

/** 当前 Agent 的陪伴资源就绪态，null 表示清单在路上 */
interface CompanionAssets {
  hasPoses: boolean;
  bgUrl: string;
}

interface PerformanceStore extends PerformanceState {
  assets: CompanionAssets | null;
  /** 组件在 Agent 变化时调用，拉清单落资源就绪态 */
  bindAgent: (agentId: string | null) => void;
  /** pose_changed 事件的入口，带门控淡化 */
  perform: (params: ShowPoseParams) => void;
  /** 会话恢复的瞬切，跳过淡化 */
  restore: (pose: string) => void;
  /** 生成相位的入口，思考气泡随之出入场 */
  setPhase: (phase: GeneratingPhase) => void;
  /** 思考气泡开关的入口，引擎不读设置库，由舞台的桥接注入 */
  setThinkingEnabled: (enabled: boolean) => void;
  motionEnded: () => void;
}

/** 立绘清单按 Agent 缓存，值是在途或已完成的请求，同一 Agent 只走一次网络 */
const catalogs = new Map<string, Promise<PoseAssets>>();

/** 取指定 Agent 的清单，fresh 为真时丢掉缓存重拉，用于清单之后新增的立绘 */
function loadCatalog(agentId: string, fresh = false): Promise<PoseAssets> {
  if (fresh) catalogs.delete(agentId);
  let request = catalogs.get(agentId);
  if (!request) {
    request = listPoses(agentId).catch((error: unknown) => {
      catalogs.delete(agentId);
      throw error;
    });
    catalogs.set(agentId, request);
  }
  return request;
}

/** 按立绘名解析带哈希的图片地址，清单里没有这个名字时重拉一次清单再试 */
async function resolvePose(pose: string): Promise<string | null> {
  const agentId = useAgentStore.getState().currentAgent?.id;
  if (!agentId) return null;
  const poseUrl = ({ poses }: PoseAssets): string | null => {
    const hash = poses.find((item) => item.name === pose)?.hash;
    return hash ? getPoseImageUrl(agentId, pose, hash) : null;
  };
  try {
    const url = poseUrl(await loadCatalog(agentId));
    if (url) return url;
    logger.info('performance', 'pose hash missing, refetch catalog', { pose });
    return poseUrl(await loadCatalog(agentId, true));
  } catch (error) {
    logger.warn('performance', 'catalog load failed', {
      pose,
      error: String(error),
    });
    return null;
  }
}

/** 离屏 Image 的解码门控，解码完成才返回自然尺寸 */
async function decodeImage(
  url: string
): Promise<{ width: number; height: number }> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return { width: img.naturalWidth, height: img.naturalHeight };
}

/** 预解码一张气泡图，失败不阻断出泡 */
async function preloadBubble(name: BubbleName): Promise<void> {
  const img = new Image();
  img.src = EFFECT_URLS[name];
  await img.decode().catch(() => undefined);
}

/** bindAgent 的次序护栏，Agent 快速连切时过期响应不落状态 */
let bindSeq = 0;

export const usePerformanceStore = create<PerformanceStore>((set) => {
  const log: PerformanceLog = {
    info: (message, detail) => logger.info('performance', message, detail),
    warn: (message, detail) => logger.warn('performance', message, detail),
  };
  const engine = new PerformanceEngine<ReturnType<typeof setTimeout>>(
    {
      resolvePose,
      decodeImage,
      preloadBubble,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (handle) => clearTimeout(handle),
      now: Date.now,
      log,
    },
    set
  );

  return {
    ...INITIAL_STATE,
    assets: null,

    bindAgent: (agentId) => {
      const seq = ++bindSeq;
      set({ assets: null });
      if (!agentId) return;
      void loadCatalog(agentId)
        .then(({ poses, backgroundHash }) => {
          if (seq !== bindSeq) return;
          set({
            assets: {
              hasPoses: poses.length > 0,
              bgUrl: backgroundHash
                ? getBackgroundImageUrl(agentId, backgroundHash)
                : '',
            },
          });
        })
        .catch(() => {
          if (seq === bindSeq) {
            set({ assets: { hasPoses: false, bgUrl: '' } });
          }
        });
    },

    perform: (params) => engine.perform(params),
    restore: (pose) => engine.restore(pose),
    setPhase: (phase) => engine.setPhase(phase),
    setThinkingEnabled: (enabled) => engine.setThinkingEnabled(enabled),
    motionEnded: () => engine.motionEnded(),
  };
});
