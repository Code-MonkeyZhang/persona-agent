/**
 * @fileoverview token-estimate 纯函数单元测试。
 */

import { describe, it, expect } from 'bun:test';
import {
  estimateTextTokens,
  estimateToolsTokens,
  estimateMessageTokens,
  estimateMessagesTokens,
  messageToText,
} from '../src/agent/memory/token-estimate.js';
import type { Message } from '../src/schema/index.js';

describe('token-estimate', () => {
  describe('estimateTextTokens', () => {
    it('空字符串返回 0', () => {
      expect(estimateTextTokens('')).toBe(0);
    });

    it('纯 ASCII：约 4 字符/token', () => {
      expect(estimateTextTokens('abcd')).toBe(1);
      expect(estimateTextTokens('abcdefgh')).toBe(2);
    });

    it('纯 CJK：约 1.5 token/字', () => {
      expect(estimateTextTokens('你好')).toBe(3);
      expect(estimateTextTokens('你好世界')).toBe(6);
    });

    it('中英混合：CJK 与 ASCII 分别计权后向上取整', () => {
      // 'hello你好' = 5 ASCII (1.25) + 2 CJK (3) = 4.25 → ceil 5
      expect(estimateTextTokens('hello你好')).toBe(5);
    });
  });

  describe('estimateToolsTokens', () => {
    it('按模型投影序列化长度按密度估算', () => {
      const tools = [{ name: 'read', parameters: { path: 'a' } }];
      expect(estimateToolsTokens(tools)).toBe(
        estimateTextTokens(
          JSON.stringify([{ name: 'read', description: undefined, parameters: { path: 'a' } }])
        )
      );
    });

    it('实例携带循环引用不抛错，引用不参与计价', () => {
      // 模拟 MCPTool，实例身上挂着活的客户端对象，其内部互相引用
      const client: Record<string, unknown> = {};
      client.self = client;
      const tools = [
        {
          name: 'mcp__entry_demo',
          description: 'demo tool',
          parameters: { type: 'object', properties: {} },
          session: client,
          execute: async () => ({ success: true, content: '' }),
        },
      ];
      expect(() => estimateToolsTokens(tools)).not.toThrow();
      expect(estimateToolsTokens(tools)).toBe(
        estimateTextTokens(
          JSON.stringify([
            {
              name: 'mcp__entry_demo',
              description: 'demo tool',
              parameters: { type: 'object', properties: {} },
            },
          ])
        )
      );
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
    it('纯文本消息：消息头开销加内容密度', () => {
      // 'abcd' = 1 token，加 MESSAGE_OVERHEAD 4
      const msg: Message = { role: 'user', content: 'abcd' };
      expect(estimateMessageTokens(msg)).toBe(5);
    });

    it('图片块按固定一千五加块标签计价', () => {
      const msg: Message = {
        role: 'user',
        content: [
          { type: 'text', text: '看图' },
          {
            type: 'image',
            hash: 'h',
            mimeType: 'image/png',
            width: 10,
            height: 10,
            bytes: 100,
          },
        ],
      };
      // 4 头 + 文本块 2+3 + 图片块 2+1500
      expect(estimateMessageTokens(msg)).toBe(1511);
    });

    it('PDF 文件块按固定两千计价', () => {
      const msg: Message = {
        role: 'user',
        content: [{ type: 'file', hash: 'h', name: 'report.pdf', bytes: 10 }],
      };
      // 4 头 + 2 标签 + 2000
      expect(estimateMessageTokens(msg)).toBe(2006);
    });

    it('普通文件块按文件名密度计价', () => {
      const msg: Message = {
        role: 'user',
        content: [{ type: 'file', hash: 'h', name: 'a.txt', bytes: 10 }],
      };
      // 4 头 + 2 标签 + 'a.txt' 5 字符 → 2
      expect(estimateMessageTokens(msg)).toBe(8);
    });

    it('tool_calls 的函数名与参数分别按密度计', () => {
      const msg: Message = {
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: '1',
            type: 'function',
            function: { name: 'read', arguments: { a: 1 } },
          },
        ],
      };
      // 4 头 + 2 标签 + 'read' 1 + '{"a":1}' 7 字符 2
      expect(estimateMessageTokens(msg)).toBe(9);
    });

    it('thinking 维持不计的既有口径', () => {
      const withThinking: Message = { role: 'assistant', content: 'abcd' };
      const msg: Message = { ...withThinking, thinking: '很长的思考' };
      expect(estimateMessageTokens(msg)).toBe(
        estimateMessageTokens(withThinking)
      );
    });
  });

  describe('estimateMessagesTokens', () => {
    it('累加多条消息的 token', () => {
      const msgs: Message[] = [
        { role: 'user', content: 'abcd' }, // 5
        { role: 'assistant', content: 'efgh' }, // 5
      ];
      expect(estimateMessagesTokens(msgs)).toBe(10);
    });
  });
});
