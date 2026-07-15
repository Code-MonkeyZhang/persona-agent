/**
 * @fileoverview AI 陪伴形象的立绘表情管理工具。
 *
 * 提供两个工具供 Agent 在对话中自主切换和查询表情：
 * - ShowPoseTool: 将立绘切换到指定表情（仅校验，不写状态）
 * - GetCurrentPoseTool: 从 session 查询当前正在显示的表情
 *
 * pose 的持久化由 chat-service 在 show_pose 成功后写入 session.jsonl，
 * 工具本身不维护任何运行时状态。
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAgentAssetsPoseDir } from '../util/paths.js';
import type { SessionManager } from '../session/session-manager.js';
import type { Tool, ToolResult } from './base.js';

type ShowPoseInput = {
  pose: string;
};

type GetCurrentPoseInput = Record<string, unknown>;

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
    .map((f) => path.parse(f).name);
}

/**
 * 切换立绘表情的工具。
 *
 * 初始化时读取该 Agent 目录下的所有表情文件，将名称列表写入 description，
 * 使 LLM 在工具列表中即可看到可用的表情选项。
 * 执行时校验请求的表情是否存在，校验通过返回成功；持久化由 chat-service 负责。
 */
export class ShowPoseTool implements Tool<ShowPoseInput> {
  public name = 'show_pose';
  public description: string;
  public parameters = {
    type: 'object' as const,
    properties: {
      pose: {
        type: 'string',
        description: '要切换的表情名称',
      },
    },
    required: ['pose'],
  };

  /**
   * 创建 ShowPoseTool 实例。
   *
   * @param agentId - 关联的 Agent 唯一标识，用于读取可用表情列表
   */
  constructor(private agentId: string) {
    const poses = getAvailablePoses(agentId);
    const poseList = poses.length > 0 ? poses.join('、') : '（无可用表情）';
    this.description =
      `你每时每刻都要根据当前对话内容的情绪和语境, 调用此工具来切换表情。\n` +
      `当前可用的表情：${poseList}`;
  }

  /**
   * 执行表情校验。
   *
   * 校验指定表情是否在可用列表中，通过则返回成功，
   * 否则返回包含可用列表的错误信息。
   *
   * @param params - 包含目标表情名称的参数对象
   * @returns 操作结果，成功时 content 为切换确认信息
   */
  async execute(params: ShowPoseInput): Promise<ToolResult> {
    const available = getAvailablePoses(this.agentId);

    if (available.length === 0) {
      return {
        success: false,
        content: '',
        error: '当前 Agent 没有配置任何表情资源',
      };
    }

    if (!available.includes(params.pose)) {
      return {
        success: false,
        content: '',
        error: `表情 "${params.pose}" 不存在。可用表情：${available.join('、')}`,
      };
    }

    return {
      success: true,
      content: `已切换表情为：${params.pose}`,
    };
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
