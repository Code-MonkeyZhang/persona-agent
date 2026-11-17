/**
 * @fileoverview 强制无工具收尾轮测试：步数耗尽触发、toolChoice none、
 * 漏网调用拒绝、固定兜底与 ephemeralTail 恢复。
 */

import { describe, it, expect, beforeEach, mock } from 'bun:test';
import type { Model, Api } from '@earendil-works/pi-ai';
import type { AgentEvent } from '../src/schema/index.js';

/** 每次流调用的选项记录 */
const streamCalls: Array<{ options: Record<string, unknown> }> = [];

/** 按调用次序消费的事件脚本，调用一次弹一组 */
let scripts: Array<Array<Record<string, unknown>>> = [];

/** 假流函数，产出脚本事件并记录选项 */
function fakeStream(
  _model: unknown,
  _context: unknown,
  options: Record<string, unknown> = {}
) {
  streamCalls.push({ options });
  const events = scripts.shift() ?? [];
  return (async function* () {
    for (const event of events) {
      yield event;
    }
  })();
}

/** Mock pi-models，替掉真实供应商调用 */
mock.module('../src/agent/pi-models.js', () => ({
  models: { stream: fakeStream },
}));

import { AgentCore } from '../src/agent/agent.js';
import type { AgentRunConfig } from '../src/agent/types.js';
import type { Message } from '../src/schema/index.js';

/**
 * 构造最小 run 配置。
 *
 * @param maxSteps - 主循环步数上限
 * @returns 可直接传入 AgentCore 的配置
 */
function makeConfig(maxSteps: number): AgentRunConfig {
  return {
    agentName: 't',
    provider: 'zai',
    modelId: 'glm-5.3-flash',
    model: { id: 'glm-5.3-flash' } as unknown as Model<Api>,
    apiKey: 'k',
    systemPrompt: 'sys',
    workspaceDir: '/tmp',
    maxSteps,
    tools: [],
  };
}

/**
 * 跑完整个 runStream，收集全部事件与返回值。
 *
 * @param agent - 被测 AgentCore 实例
 * @returns 事件数组与生成器返回值
 */
async function drain(agent: AgentCore): Promise<{
  events: AgentEvent[];
  returnValue: string;
}> {
  const events: AgentEvent[] = [];
  const iterator = agent.runStream();
  let step = await iterator.next();
  while (!step.done) {
    events.push(step.value);
    step = await iterator.next();
  }
  return { events, returnValue: step.value };
}

/** 构造一次 show_pose 工具调用结束事件 */
function poseCall(id: string): Record<string, unknown> {
  return {
    type: 'toolcall_end',
    toolCall: { id, name: 'show_pose', arguments: { pose: '开心' } },
  };
}

/** 建一个跑两步工具循环后进入收尾轮的 Agent */
function loopingAgent(): AgentCore {
  const agent = new AgentCore(makeConfig(2));
  agent.addUserMessage('感觉不错');
  return agent;
}

describe('Forced final turn', () => {
  /** 每个测试前重置调用记录与脚本 */
  beforeEach(() => {
    streamCalls.length = 0;
    scripts = [];
  });

  /** 测试：步数耗尽后追加无工具收尾轮并必出文字 */
  it('should append a no-tool turn with text after max steps', async () => {
    scripts = [
      [poseCall('c1'), { type: 'done' }],
      [poseCall('c2'), { type: 'done' }],
      [{ type: 'text_delta', delta: '好，直接回复你。' }, { type: 'done' }],
    ];
    const agent = loopingAgent();
    const { events, returnValue } = await drain(agent);

    const stepStarts = events.filter((e) => e.type === 'step_start');
    expect(stepStarts).toHaveLength(3);
    expect(streamCalls).toHaveLength(3);
    expect(streamCalls[0].options.toolChoice).toBeUndefined();
    expect(streamCalls[2].options.toolChoice).toBe('none');
    expect(returnValue).toBe('好，直接回复你。');
    const last = agent.messages[agent.messages.length - 1];
    expect(last.role).toBe('assistant');
    expect(last.content).toBe('好，直接回复你。');
  });

  /** 测试：收尾轮漏网调用被拒绝，零文字时用固定兜底 */
  it('should reject leaked calls and use fallback when no text', async () => {
    scripts = [
      [poseCall('c1'), { type: 'done' }],
      [poseCall('c2'), { type: 'done' }],
      [poseCall('c3'), { type: 'done' }],
    ];
    const agent = loopingAgent();
    const { returnValue } = await drain(agent);

    expect(returnValue).toBe('这轮我有点卡住了，你可以再说一句吗？');
    const last = agent.messages[agent.messages.length - 1] as Message & {
      tool_calls?: Array<{
        toolResult?: { isError?: boolean; content?: string };
      }>;
    };
    expect(last.tool_calls).toBeDefined();
    expect(last.tool_calls?.[0].toolResult?.isError).toBe(true);
    expect(last.tool_calls?.[0].toolResult?.content).toContain('已被禁用');
  });

  /** 测试：收尾轮结束恢复原 ephemeralTail */
  it('should restore the original ephemeralTail after final turn', async () => {
    scripts = [
      [poseCall('c1'), { type: 'done' }],
      [poseCall('c2'), { type: 'done' }],
      [{ type: 'text_delta', delta: '好的。' }, { type: 'done' }],
    ];
    const agent = loopingAgent();
    agent.ephemeralTail = 'SENTINEL';
    await drain(agent);

    expect(agent.ephemeralTail).toBe('SENTINEL');
  });

  /** 测试：模型自然停止时只调一次流，不进收尾轮 */
  it('should never start the final turn on natural exit', async () => {
    scripts = [[{ type: 'text_delta', delta: '你好呀。' }, { type: 'done' }]];
    const agent = new AgentCore(makeConfig(2));
    agent.addUserMessage('你好');
    const { events, returnValue } = await drain(agent);

    expect(streamCalls).toHaveLength(1);
    expect(streamCalls[0].options.toolChoice).toBeUndefined();
    expect(events.filter((e) => e.type === 'step_start')).toHaveLength(1);
    expect(returnValue).toBe('你好呀。');
  });
});
