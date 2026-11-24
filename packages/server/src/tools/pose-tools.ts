/**
 * @fileoverview AI 陪伴形象的演出工具。
 *
 * 提供两个工具供 Agent 在对话中自主驱动演出：
 * - ShowPoseTool: 一次调用同时指定换脸、身体动作与情绪气泡，三者至少一个
 * - GetCurrentPoseTool: 从 session 查询当前正在显示的表情
 *
 * pose 的持久化与演出事件的广播由 chat-service 在 show_pose 成功后处理，
 * 工具本身不维护任何运行时状态。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  BUBBLE_CN,
  BUBBLE_NAMES,
  MOTION_CN,
  MOTION_NAMES,
  isBubbleName,
  isMotionName,
  type BubbleName,
  type MotionName,
} from '@persona/shared';
import { getAgentAssetsPoseDir } from '../util/paths.js';
import type { SessionManager } from '../session/session-manager.js';
import type { Tool, ToolResult } from './base.js';

/** 模型传入的原始参数，三个值在校验前都只是未知值 */
type ShowPoseInput = {
  pose?: unknown;
  motion?: unknown;
  bubble?: unknown;
};

type GetCurrentPoseInput = Record<string, unknown>;

/** 气泡名单的一行展示，英文名配中文含义，说明书与校验报错共用 */
const BUBBLE_ROSTER = BUBBLE_NAMES.map(
  (name) => `${name} ${BUBBLE_CN[name]}`
).join(' · ');

/** 工具说明的定稿原文，两份名单在构造时拼在末尾 */
const INSTRUCTIONS = `切换陪伴立绘的表情，并可以同时播放身体动作和情绪气泡，让角色的情绪变化有可见的演出。

什么时候调用：
- 情绪发生转折时就调用，一轮回复里可以调用多次，每次调用都会立刻生效
- 想强调当前情绪时，可以再次调用同一个表情，脸不会重复切换，动作和气泡会重新播放
- 情绪没有起伏时安静用文字回复，不必调用

参数怎么填：
- pose 填立绘表情名，从下方表情名单里选，只想播动作或冒气泡时可以省略
- motion 填身体动作，从 ${MOTION_NAMES.join('、')} 里选
- bubble 填情绪气泡，从下方气泡名单里选，气泡是头顶冒出的漫画情绪符号，显示约两秒自动消失
- 三个参数至少填一个

动作观感：弹跳是向上蹦一下落地回弹，跺脚是快速下压加左右小扭，心跳是缩放两连脉冲，下沉是下坠微缩再回位。

推荐搭配：开心配弹跳加高兴，喜欢配心跳加心动，难过配下沉加流泪，生气配跺脚加生气，平静时只换脸不带演出。不必每次都带全套，演出太密会显得吵。`;

/**
 * 从文件系统读取指定 Agent 所有可用的表情名称。
 *
 * @param agentId - Agent 唯一标识
 * @returns 表情名称数组，目录不存在时返回空数组
 */
function getAvailablePoses(agentId: string): string[] {
  const poseDir = getAgentAssetsPoseDir(agentId);
  if (!fs.existsSync(poseDir)) return [];

  return fs
    .readdirSync(poseDir)
    .filter((f) => /\.(png|jpg|jpeg|gif|webp)$/i.test(f))
    .sort()
    .map((f) => path.parse(f).name);
}

/**
 * 驱动陪伴演出的工具。
 *
 * 初始化时读取该 Agent 目录下的所有表情文件，与 shared 的气泡名单一起拼进 description，
 * 使 LLM 在工具列表里就能看到完整说明书与两份名单。
 * 执行时校验三个参数并给出道出实际演出的回话，与 session 当前表情的同名比对只影响回话文案。
 * 持久化与演出广播由 chat-service 负责。
 */
export class ShowPoseTool implements Tool<ShowPoseInput> {
  public name = 'show_pose';
  public description: string;
  public parameters = {
    type: 'object' as const,
    properties: {
      pose: {
        type: 'string',
        description:
          '要切换的立绘表情名，从工具说明底部的表情名单里选。只想播放动作或气泡、不换表情时可以省略。',
      },
      motion: {
        type: 'string',
        enum: MOTION_NAMES,
        description: `同时播放的身体动作。${MOTION_NAMES.map((name) => `${name} ${MOTION_CN[name]}`).join('、')}四选一，不需要动作时省略。`,
      },
      bubble: {
        type: 'string',
        enum: BUBBLE_NAMES,
        description:
          '同时在头顶冒出的情绪气泡，显示约两秒自动消失。从工具说明底部的气泡名单里选英文名，不需要气泡时省略。',
      },
    },
  };

  /**
   * 创建 ShowPoseTool 实例。
   *
   * @param agentId - 关联的 Agent 唯一标识，用于读取可用表情列表
   * @param sessionManager - Session 管理器，用于读取当前表情做同名比对
   * @param sessionId - 当前 Session 标识
   */
  constructor(
    private agentId: string,
    private sessionManager: SessionManager,
    private sessionId: string
  ) {
    const poses = getAvailablePoses(agentId);
    const poseList = poses.length > 0 ? poses.join('、') : '（无可用表情）';
    this.description = `${INSTRUCTIONS}\n\n当前可用的表情：${poseList}\n当前可用的气泡：${BUBBLE_ROSTER}`;
  }

  /**
   * 执行三参数校验并拼装回话。
   *
   * 校验顺序是表情存在性、动作枚举、气泡名单，各自报错并列出可用名单。
   * 请求立绘与 session 当前表情一致时回话说明脸保持不变，
   * 动作与气泡无论同名与否都说明已播放。
   *
   * @param params - 包含立绘、动作与气泡的参数对象，三者至少一个
   * @returns 操作结果，成功时 content 道出本次实际发生的全部演出
   */
  async execute(params: ShowPoseInput): Promise<ToolResult> {
    const poseArg: unknown = params.pose;
    const pose = typeof poseArg === 'string' && poseArg ? poseArg : undefined;
    const motionArg: unknown = params.motion;
    const motion = typeof motionArg === 'string' ? motionArg : undefined;
    const bubbleArg: unknown = params.bubble;
    const bubble = typeof bubbleArg === 'string' ? bubbleArg : undefined;

    if (!pose && !motion && !bubble) {
      return {
        success: false,
        content: '',
        error:
          '三个参数至少填一个：pose 换立绘表情，motion 播身体动作，bubble 冒情绪气泡。',
      };
    }

    if (pose) {
      const available = getAvailablePoses(this.agentId);
      if (!available.includes(pose)) {
        return {
          success: false,
          content: '',
          error:
            available.length === 0
              ? '当前 Agent 没有配置任何表情资源'
              : `表情 "${pose}" 不存在。可用表情：${available.join('、')}`,
        };
      }
    }

    if (motion !== undefined && !isMotionName(motion)) {
      return {
        success: false,
        content: '',
        error: `动作 "${motion}" 不存在。可用动作：${MOTION_NAMES.join('、')}`,
      };
    }

    if (bubble !== undefined && !isBubbleName(bubble)) {
      return {
        success: false,
        content: '',
        error: `气泡 "${bubble}" 不存在。可用气泡：${BUBBLE_ROSTER}`,
      };
    }

    return {
      success: true,
      content: this.reply(pose, motion, bubble),
    };
  }

  /**
   * 拼装成功回话，道出本次实际发生的全部演出。
   *
   * @param pose - 已校验的立绘表情名，缺省代表本次不换脸
   * @param motion - 已校验的动作名
   * @param bubble - 已校验的气泡名
   * @returns 回话文本
   */
  private reply(
    pose: string | undefined,
    motion: MotionName | undefined,
    bubble: BubbleName | undefined
  ): string {
    const effects = [
      motion
        ? { done: `播放${MOTION_CN[motion]}`, name: MOTION_CN[motion] }
        : null,
      bubble
        ? {
            done: `冒${BUBBLE_CN[bubble]}气泡`,
            name: `${BUBBLE_CN[bubble]}气泡`,
          }
        : null,
    ].filter(
      (effect): effect is { done: string; name: string } => effect !== null
    );

    const session = this.sessionManager.getSession(this.sessionId);
    if (pose && pose === (session?.currentPose ?? 'default')) {
      const replayed = effects.map((effect) => effect.name).join('与');
      return `当前立绘已是${pose}，脸保持不变，${replayed ? `${replayed}已重新播放` : '无需重复切换'}。`;
    }

    const parts = [
      ...(pose ? [`已切换立绘为${pose}`] : []),
      ...effects.map((effect) => effect.done),
    ];
    return `${parts.join('，')}。演出已生效，请继续用文字回复用户。`;
  }
}

/**
 * 查询当前表情的工具。
 *
 * 从 session 元数据读取当前正在显示的表情名称。
 * session 中无记录时 fallback 到 'default'。
 */
export class GetCurrentPoseTool implements Tool<GetCurrentPoseInput> {
  public name = 'get_current_pose';
  public description = '查询当前正在显示的表情名称。调用后返回当前表情的名字。';
  public parameters = {
    type: 'object' as const,
    properties: {},
  };

  /**
   * 创建 GetCurrentPoseTool 实例。
   *
   * @param sessionManager - Session 管理器，用于读取 session 元数据
   * @param sessionId - 当前 Session 标识
   */
  constructor(
    private sessionManager: SessionManager,
    private sessionId: string
  ) {}

  /**
   * 执行表情查询。
   *
   * 从 session 元数据读取 currentPose，无记录时 fallback 到 'default'。
   *
   * @param _params - 无实际参数
   * @returns 操作结果，成功时 content 包含当前表情名称
   */
  async execute(_params: GetCurrentPoseInput): Promise<ToolResult> {
    const session = this.sessionManager.getSession(this.sessionId);
    const current = session?.currentPose ?? 'default';

    return {
      success: true,
      content: `当前表情：${current}`,
    };
  }
}
