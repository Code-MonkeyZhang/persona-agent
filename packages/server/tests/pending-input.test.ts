/**
 * @fileoverview 待注入缓冲与注入文本形态单元测试
 */

import { describe, it, expect } from 'bun:test';

import {
  addPendingInput,
  drainPendingInputs,
  hasPendingInputs,
} from '../src/server/services/pending-input-service.js';
import {
  formatAppNotificationForAgent,
  formatPendingInputForAgent,
} from '../src/agent/inject.js';

describe('pending-input-service', () => {
  it('写入后按序取出并生成 id，取空后再次取出为空', () => {
    const sessionId = `pending-test-${crypto.randomUUID()}`;
    addPendingInput(sessionId, { source: 'user', content: '第一条' });
    const app = addPendingInput(sessionId, {
      source: 'app',
      sourceName: 'pomodoro-timer',
      content: '番茄钟完成',
    });

    expect(app.id).toBeTruthy();
    expect(hasPendingInputs(sessionId)).toBe(true);

    const drained = drainPendingInputs(sessionId);
    expect(drained).toHaveLength(2);
    expect(drained[0]!.content).toBe('第一条');
    expect(drained[1]!.sourceName).toBe('pomodoro-timer');
    // 缓冲已取空，且未注册的会话查询与取空不抛错
    expect(hasPendingInputs(sessionId)).toBe(false);
    expect(drainPendingInputs(sessionId)).toHaveLength(0);
    expect(drainPendingInputs(`no-such-${crypto.randomUUID()}`)).toHaveLength(0);
  });
});

describe('inject', () => {
  it('App 通知拼既有来源前缀', () => {
    expect(formatAppNotificationForAgent('番茄钟', '完成')).toBe(
      '[来自应用「番茄钟」的事件] 完成'
    );
  });

  it('用户插话保持原话零包装，App 通知按来源分派', () => {
    expect(
      formatPendingInputForAgent({ id: 'x', source: 'user', content: '继续' })
    ).toBe('继续');
    expect(
      formatPendingInputForAgent({
        id: 'x',
        source: 'app',
        content: '通知内容',
      })
    ).toContain('[来自应用「app」的事件]');
  });
});
