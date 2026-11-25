/**
 * @fileoverview show_pose 工具测试：三参数校验、回话文案与说明书口径。
 */

import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import * as fs from 'node:fs';
import { rmTempDir } from './temp-cleanup.js';
import * as path from 'node:path';
import * as os from 'node:os';
import { BUBBLE_NAMES, MOTION_NAMES } from '@persona/shared';

/** 临时测试目录 */
let tempDir: string;

/** Mock 路径模块，pose 目录指向临时目录 */
mock.module('../src/util/paths.js', () => ({
  getAgentAssetsPoseDir: (id: string) =>
    path.join(tempDir, 'agents', id, 'pose'),
}));

import { ShowPoseTool } from '../src/tools/pose-tools.js';
import type { SessionManager } from '../src/session/session-manager.js';

/**
 * 构造返回固定 currentPose 的 SessionManager 桩。
 *
 * @param currentPose - 会话当前表情，undefined 模拟无 session 记录
 * @returns 可直接传入 ShowPoseTool 的桩对象
 */
function fakeSessionManager(currentPose?: string): SessionManager {
  return {
    getSession: () => (currentPose === undefined ? undefined : { currentPose }),
  } as unknown as SessionManager;
}

describe('ShowPoseTool', () => {
  /** 初始化临时目录并造两个表情资产 */
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pose-tools-test-'));
    const poseDir = path.join(tempDir, 'agents', 'a1', 'pose');
    fs.mkdirSync(poseDir, { recursive: true });
    fs.writeFileSync(path.join(poseDir, 'default.png'), 'x');
    fs.writeFileSync(path.join(poseDir, '开心.png'), 'x');
    fs.writeFileSync(path.join(poseDir, '非常开心.png'), 'x');
  });

  /** 清理临时目录 */
  afterAll(() => {
    rmTempDir(tempDir);
  });

  /** 测试：说明书写明可多次调用与名单两行，旧的克制措辞已退场 */
  it('should describe multi-call usage with pose and bubble rosters', () => {
    const tool = new ShowPoseTool('a1', fakeSessionManager('开心'), 's1');
    expect(tool.description).toContain('一轮回复里可以调用多次');
    expect(tool.description).not.toContain('只在情绪发生变化时调用一次');
    expect(tool.description).toContain(
      '当前可用的表情：default、开心、非常开心'
    );
    expect(tool.description).toContain(
      `当前可用的气泡：${BUBBLE_NAMES[0]} ${'高兴'}`
    );
    for (const name of MOTION_NAMES) {
      expect(tool.description).toContain(name);
    }
  });

  /** 测试：参数定义的动作与气泡枚举直接取自 shared 名单 */
  it('should derive parameter enums from shared rosters', () => {
    const tool = new ShowPoseTool('a1', fakeSessionManager(), 's1');
    expect(tool.parameters.properties).toMatchObject({
      motion: { enum: MOTION_NAMES },
      bubble: { enum: BUBBLE_NAMES },
    });
    expect(tool.parameters).not.toHaveProperty('required');
  });

  /** 测试：三参数全空时报错并说明用法 */
  it('should reject an empty call with usage hint', async () => {
    const tool = new ShowPoseTool('a1', fakeSessionManager(), 's1');
    const result = await tool.execute({});
    expect(result.success).toBe(false);
    expect(result.error).toContain('三个参数至少填一个');
  });

  /** 测试：换脸加动作加气泡时回话道出全部演出 */
  it('should narrate every requested effect on success', async () => {
    const tool = new ShowPoseTool('a1', fakeSessionManager('开心'), 's1');
    const result = await tool.execute({
      pose: '非常开心',
      motion: 'heart-beat',
      bubble: 'flutter',
    });
    expect(result.success).toBe(true);
    expect(result.content).toBe(
      '已切换立绘为非常开心，播放心动心跳，冒心动气泡。演出已生效，请继续用文字回复用户。'
    );
  });

  /** 测试：只换脸时回话只道换脸 */
  it('should narrate only the face change when no effect is requested', async () => {
    const tool = new ShowPoseTool('a1', fakeSessionManager('开心'), 's1');
    const result = await tool.execute({ pose: '非常开心' });
    expect(result.success).toBe(true);
    expect(result.content).toBe(
      '已切换立绘为非常开心。演出已生效，请继续用文字回复用户。'
    );
  });

  /** 测试：不换脸只播演出时回话不提立绘 */
  it('should narrate effects only when pose is omitted', async () => {
    const tool = new ShowPoseTool('a1', fakeSessionManager('开心'), 's1');
    const result = await tool.execute({
      motion: 'happy-bounce',
      bubble: 'happy',
    });
    expect(result.success).toBe(true);
    expect(result.content).toBe(
      '播放开心弹跳，冒高兴气泡。演出已生效，请继续用文字回复用户。'
    );
  });

  /** 测试：请求表情与当前一致时说明脸保持不变且动作气泡已重播 */
  it('should keep the face and replay effects for a same-pose call', async () => {
    const tool = new ShowPoseTool('a1', fakeSessionManager('开心'), 's1');
    const replay = await tool.execute({
      pose: '开心',
      motion: 'happy-bounce',
      bubble: 'happy',
    });
    expect(replay.success).toBe(true);
    expect(replay.content).toBe(
      '当前立绘已是开心，脸保持不变，开心弹跳与高兴气泡已重新播放。'
    );

    const bare = await tool.execute({ pose: '开心' });
    expect(bare.content).toBe('当前立绘已是开心，脸保持不变，无需重复切换。');
  });

  /** 测试：session 无记录时默认表情视为当前表情 */
  it('should treat default as current when session has no pose record', async () => {
    const tool = new ShowPoseTool('a1', fakeSessionManager(undefined), 's1');
    const result = await tool.execute({ pose: '开心' });
    expect(result.success).toBe(true);
    expect(result.content).toContain('已切换立绘为开心');
  });

  /** 测试：未知表情返回带可用列表的错误 */
  it('should reject unknown pose with available list', async () => {
    const tool = new ShowPoseTool('a1', fakeSessionManager(), 's1');
    const result = await tool.execute({ pose: '难过' });
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      '表情 "难过" 不存在。可用表情：default、开心、非常开心'
    );
  });

  /** 测试：未知动作返回带枚举名单的错误 */
  it('should reject unknown motion with enum list', async () => {
    const tool = new ShowPoseTool('a1', fakeSessionManager(), 's1');
    const result = await tool.execute({ motion: 'angry-jump' });
    expect(result.success).toBe(false);
    expect(result.error).toBe(
      `动作 "angry-jump" 不存在。可用动作：${MOTION_NAMES.join('、')}`
    );
  });

  /** 测试：未知气泡返回带名单的错误，名单配中文含义 */
  it('should reject unknown bubble with bilingual roster', async () => {
    const tool = new ShowPoseTool('a1', fakeSessionManager(), 's1');
    const result = await tool.execute({ bubble: 'star' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('气泡 "star" 不存在');
    expect(result.error).toContain('happy 高兴');
    expect(result.error).toContain('angry2 生气2');
    expect(result.error).not.toContain('thinking');
  });

  /** 测试：校验顺序是表情、动作、气泡，先错先报 */
  it('should report the first failing parameter in order', async () => {
    const tool = new ShowPoseTool('a1', fakeSessionManager(), 's1');
    const result = await tool.execute({
      pose: '难过',
      motion: 'angry-jump',
      bubble: 'star',
    });
    expect(result.error).toContain('表情 "难过" 不存在');
  });

  /** 测试：无表情资产时换脸报错，只播演出不受影响 */
  it('should fail face change but allow effects when agent has no pose assets', async () => {
    const tool = new ShowPoseTool('a2', fakeSessionManager(), 's1');
    const face = await tool.execute({ pose: '开心' });
    expect(face.success).toBe(false);
    expect(face.error).toContain('没有配置任何表情资源');

    const effect = await tool.execute({ motion: 'sad-sink' });
    expect(effect.success).toBe(true);
  });
});
