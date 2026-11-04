/**
 * @fileoverview 历史构建期过滤纯函数单元测试。
 *
 * 短语映射与边界换算用例的报错原文取自事故会话 20261031-210627
 * 的存储取证，占位与跳过行为对照设计文档统一过滤规则。
 */

import { describe, it, expect } from 'bun:test';
import { sanitizeHistoryForModel } from '../src/server/services/history-sanitizer.js';
import type {
  FileContent,
  ImageContent,
  Message,
  TextContent,
} from '../src/schema/index.js';

/** 事故会话取证的真实 1301 报错原文 */
const RAW_1301 =
  '400: {"code":"1301","message":"System detected potentially unsafe or ' +
  'sensitive content in input or generation. Please avoid using prompts ' +
  'that may generate sensitive content. Thank you for your cooperation."}';

/** 事故会话取证的真实 schema 错误原文 */
const RAW_SCHEMA =
  '400: {"message":"Invalid schema for function \'move_task\': Pointer ' +
  '\'/\'$defs/OpenMoveProject\' does not exist (request_id: 08d88c99-549c-' +
  '4df7-a7de-b0c0223ab69e)","type":"invalid_request_error","param":null,' +
  '"code":"invalid_request_error"}';

const PHRASE_MODERATION = '上一回合调用失败，内容被审核拒绝';
const PHRASE_RATE_LIMIT = '上一回合调用失败，限流稍后重试';
const PHRASE_AUTH = '上一回合调用失败，鉴权失败';
const PHRASE_FALLBACK = '上一回合模型调用失败';
const IMAGE_PLACEHOLDER = '[图片附件 未成功处理 如需要请重新发送]';

const textBlock = (text: string): TextContent => ({ type: 'text', text });

const imageBlock = (hash = 'a'.repeat(64)): ImageContent => ({
  type: 'image',
  hash,
  mimeType: 'image/jpeg',
  width: 1280,
  height: 720,
  bytes: 4096,
});

const fileBlock = (name: string): FileContent => ({
  type: 'file',
  hash: 'b'.repeat(64),
  name,
  bytes: 4096,
});

const error = (content: string): Message => ({ role: 'error', content });

describe('sanitizeHistoryForModel', () => {
  describe('短语映射', () => {
    it('取证 1301 原文换审核短语', () => {
      const { messages, stats } = sanitizeHistoryForModel(
        [
          {
            role: 'user',
            content: [textBlock('这个歌呢'), imageBlock()],
          },
          error(RAW_1301),
        ],
        [],
        0
      );
      expect(messages[0].content).toEqual([
        textBlock('这个歌呢'),
        textBlock(IMAGE_PLACEHOLDER),
      ]);
      expect(messages[1]).toEqual({ role: 'error', content: PHRASE_MODERATION });
      expect(stats).toEqual({ errors: 1, placeholders: 1, skipped: 0 });
    });

    it('取证 schema 错误原文换兜底短语', () => {
      const { messages } = sanitizeHistoryForModel([error(RAW_SCHEMA)], [], 0);
      expect(messages[0]).toEqual({ role: 'error', content: PHRASE_FALLBACK });
    });

    it('429 状态前缀与 code 值都命中限流短语', () => {
      const prefix = sanitizeHistoryForModel(
        [error('429: {"error":{"message":"Too many requests"}}')],
        [],
        0
      );
      expect(prefix.messages[0].content).toBe(PHRASE_RATE_LIMIT);
      const code = sanitizeHistoryForModel(
        [error('400: {"code":"429","message":"rate limited"}')],
        [],
        0
      );
      expect(code.messages[0].content).toBe(PHRASE_RATE_LIMIT);
    });

    it('401 与 403 前缀命中鉴权短语', () => {
      const auth401 = sanitizeHistoryForModel(
        [error('401: {"message":"Incorrect API key"}')],
        [],
        0
      );
      expect(auth401.messages[0].content).toBe(PHRASE_AUTH);
      const auth403 = sanitizeHistoryForModel(
        [error('403: {"message":"Forbidden"}')],
        [],
        0
      );
      expect(auth403.messages[0].content).toBe(PHRASE_AUTH);
    });

    it('未知报错落兜底短语', () => {
      const { messages } = sanitizeHistoryForModel(
        [error('Connection error.')],
        [],
        0
      );
      expect(messages[0].content).toBe(PHRASE_FALLBACK);
    });
  });

  describe('失败回合处理', () => {
    it('纯图消息与短语一起跳过', () => {
      const { messages, stats } = sanitizeHistoryForModel(
        [{ role: 'user', content: [imageBlock()] }, error(RAW_1301)],
        [],
        0
      );
      expect(messages).toEqual([]);
      expect(stats).toEqual({ errors: 0, placeholders: 0, skipped: 1 });
    });

    it('文件附件占位携带真实文件名', () => {
      const { messages, stats } = sanitizeHistoryForModel(
        [
          {
            role: 'user',
            content: [textBlock('看看这个'), fileBlock('季度报表.pdf')],
          },
          error(RAW_1301),
        ],
        [],
        0
      );
      expect(messages[0].content).toEqual([
        textBlock('看看这个'),
        textBlock('[文件 季度报表.pdf 未成功处理 如需要请重新发送]'),
      ]);
      expect(stats.placeholders).toBe(1);
    });

    it('成功回合的附件受边界保护原样保留', () => {
      const { messages, stats } = sanitizeHistoryForModel(
        [
          { role: 'user', content: [textBlock('成功图'), imageBlock()] },
          { role: 'assistant', content: '我看到了' },
          { role: 'user', content: '这条失败' },
          error(RAW_1301),
        ],
        [2],
        0
      );
      expect(messages[0].content).toEqual([
        textBlock('成功图'),
        imageBlock(),
      ]);
      expect(messages[1].content).toBe('我看到了');
      expect(messages[2]).toEqual({ role: 'user', content: '这条失败' });
      expect(messages[3].content).toBe(PHRASE_MODERATION);
      expect(stats.placeholders).toBe(0);
    });

    it('连续两个失败回合各自独立处理', () => {
      const { messages, stats } = sanitizeHistoryForModel(
        [
          { role: 'user', content: [textBlock('第一张'), imageBlock()] },
          error(RAW_1301),
          { role: 'user', content: '第二句' },
          error(RAW_SCHEMA),
        ],
        [],
        0
      );
      expect(messages[0].content).toEqual([
        textBlock('第一张'),
        textBlock(IMAGE_PLACEHOLDER),
      ]);
      expect(messages[1].content).toBe(PHRASE_MODERATION);
      expect(messages[2]).toEqual({ role: 'user', content: '第二句' });
      expect(messages[3].content).toBe(PHRASE_FALLBACK);
      expect(stats).toEqual({ errors: 2, placeholders: 1, skipped: 0 });
    });

    it('孤儿错误没有 user 消息时短语保留', () => {
      const { messages, stats } = sanitizeHistoryForModel(
        [error('Session not found: chat-x')],
        [],
        0
      );
      expect(messages).toEqual([{ role: 'error', content: PHRASE_FALLBACK }]);
      expect(stats.errors).toBe(1);
    });

    it('入参数组与消息对象不被修改', () => {
      const messages = [
        { role: 'user', content: [textBlock('这条'), imageBlock()] },
        error(RAW_1301),
      ];
      const snapshot = JSON.parse(JSON.stringify(messages));
      sanitizeHistoryForModel(messages, [], 0);
      expect(messages).toEqual(snapshot);
    });
  });

  describe('边界换算', () => {
    it('压缩起点偏移下失败回合正确识别', () => {
      // 完整序列边界在第二条之后，切片从压缩起点开始，带图消息属于失败回合
      const { messages, stats } = sanitizeHistoryForModel(
        [
          { role: 'user', content: [textBlock('带图'), imageBlock()] },
          error(RAW_1301),
        ],
        [2],
        2
      );
      expect(messages[0].content).toEqual([
        textBlock('带图'),
        textBlock(IMAGE_PLACEHOLDER),
      ]);
      expect(stats.placeholders).toBe(1);
    });

    it('头裁偏移下成功回合的附件受保护', () => {
      const loaded: Message[] = [
        { role: 'user', content: '第二问' },
        { role: 'assistant', content: '第二答' },
        { role: 'user', content: [textBlock('毒图'), imageBlock()] },
        error(RAW_1301),
      ];
      const { messages, stats } = sanitizeHistoryForModel(loaded, [4], 2);
      expect(messages[0]).toEqual({ role: 'user', content: '第二问' });
      expect(messages[1].content).toBe('第二答');
      expect(messages[2].content).toEqual([
        textBlock('毒图'),
        textBlock(IMAGE_PLACEHOLDER),
      ]);
      expect(stats.placeholders).toBe(1);
    });
  });

  describe('防误报', () => {
    it('request_id 含孤立 429 段不误判限流', () => {
      const { messages } = sanitizeHistoryForModel(
        [
          error(
            '400: {"message":"boom (request_id: 08d88c99-429-4df7-a7de)",' +
              '"type":"invalid_request_error","code":"invalid_request_error"}'
          ),
        ],
        [],
        0
      );
      expect(messages[0].content).toBe(PHRASE_FALLBACK);
    });
  });
});
