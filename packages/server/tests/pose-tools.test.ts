/**
 * @fileoverview show_pose 工具测试：条件式描述、幂等短路与参数校验。
 */

import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test';
import * as fs from 'node:fs';
import { rmTempDir } from './temp-cleanup.js';
import * as path from 'node:path';
import * as os from 'node:os';

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
    getSession: () =>
      currentPose === undefined ? undefined : { currentPose },
  } as unknown as SessionManager;
}

describe('ShowPoseTool', () => {
  /** 初始化临时目录并造两个表情资产 */
  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pose-tools-test-'));
    const poseDir = path.join(tempDir, 'agents', 'a1', 'pose');
    fs.mkdirSync(poseDir, { recursive: true });
    fs.writeFileSync(path.join(poseDir, '开心.png'), 'x');
    fs.writeFileSync(path.join(poseDir, '非常开心.png'), 'x');
  });

  /** 清理临时目录 */
  afterAll(() => {
    rmTempDir(tempDir);
  });

  /** 测试：描述为条件式指令，不再含命令式措辞 */
  it('should use conditional description without imperative wording', () => {
    const tool = new ShowPoseTool('a1', fakeSessionManager('开心'), 's1');
    expect(tool.description).toContain('只在情绪发生变化时调用一次');
    expect(tool.description).not.toContain('每时每刻');
  });

  /** 测试：请求表情与当前一致时走幂等短路 */
  it('should short-circuit when requested pose equals current pose', async () => {
    const tool = new ShowPoseTool('a1', fakeSessionManager('开心'), 's1');
    const result = await tool.execute({ pose: '开心' });
    expect(result.success).toBe(true);
    expect(result.content).toBe('当前表情已经是「开心」，无需重复切换。');
  });

  /** 测试：请求表情不同时正常切换并带终止引导 */
  it('should switch and guide back to text for a new pose', async () => {
    const tool = new ShowPoseTool('a1', fakeSessionManager('开心'), 's1');
    const result = await tool.execute({ pose: '非常开心' });
    expect(result.success).toBe(true);
    expect(result.content).toBe(
      '已切换表情为：非常开心。表情已生效，无需重复切换，请继续用文字回复用户。'
    );
  });

  /** 测试：session 无记录时不短路，正常切换 */
  it('should switch normally when session has no pose record', async () => {
    const tool = new ShowPoseTool('a1', fakeSessionManager(undefined), 's1');
    const result = await tool.execute({ pose: '开心' });
    expect(result.success).toBe(true);
    expect(result.content).toContain('已切换表情为：开心');
  });

  /** 测试：未知表情返回带可用列表的错误 */
  it('should reject unknown pose with available list', async () => {
    const tool = new ShowPoseTool('a1', fakeSessionManager(), 's1');
    const result = await tool.execute({ pose: '难过' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('开心');
  });

  /** 测试：无表情资产时报错 */
  it('should fail when agent has no pose assets', async () => {
    const tool = new ShowPoseTool('a2', fakeSessionManager(), 's1');
    const result = await tool.execute({ pose: '开心' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('没有配置任何表情资源');
  });
});
