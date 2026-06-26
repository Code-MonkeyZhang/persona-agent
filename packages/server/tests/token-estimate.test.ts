/**
 * @fileoverview token-estimate 纯函数单元测试。
 */

import { describe, it, expect } from 'bun:test';
import {
  estimateTokens,
  estimateMessageTokens,
  estimateMessagesTokens,
  messageToText,
} from '../src/agent/memory/token-estimate.js';
import type { Message } from '../src/schema/index.js';

describe('token-estimate', () => {
  describe('estimateTokens', () => {
    it('空字符串返回 0', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('纯 ASCII：约 4 字符/token', () => {
      expect(estimateTokens('abcd')).toBe(1);
      expect(estimateTokens('abcdefgh')).toBe(2);
    });

    it('纯 CJK：约 1.5 token/字', () => {
      expect(estimateTokens('你好')).toBe(3);
      expect(estimateTokens('你好世界')).toBe(6);
    });

    it('中英混合：CJK 与 ASCII 分别计权后向上取整', () => {
      // 'hello你好' = 5 ASCII (1.25) + 2 CJK (3) = 4.25 → ceil 5
      expect(estimateTokens('hello你好')).toBe(5);
    });
  });

  describe('messageToText', () => {
    it('格式化为 role: content', () => {
      const msg: Message = { role: 'user', content: 'Hello' };
      expect(messageToText(msg)).toBe('user: Hello');
    });

    it('assistant 无 content 时仍输出 role 前缀', () => {
      const msg: Message = { role: 'assistant' };
      expect(messageToText(msg)).toBe('assistant: ');
    });
  });

  describe('estimateMessageTokens', () => {
    it('估算含 role 前缀', () => {
      // 'user: abcd' = 10 ASCII → 2.5 → ceil 3
      const msg: Message = { role: 'user', content: 'abcd' };
      expect(estimateMessageTokens(msg)).toBe(3);
    });
  });

  describe('estimateMessagesTokens', () => {
    it('累加多条消息的 token', () => {
      const msgs: Message[] = [
        { role: 'user', content: 'abcd' }, // 'user: abcd' → 3
        { role: 'assistant', content: 'efgh' }, // 'assistant: efgh' → 4
      ];
      expect(estimateMessagesTokens(msgs)).toBe(7);
    });
  });
});
