/**
 * @fileoverview 模型自写叙述的注入与剥离纯函数测试。
 *
 * 注入给发往模型的工具 schema 补两个必填栏位，剥离在事件源头把
 * 栏位从参数移到 ToolCall 顶层，工具实现看到的参数永远干净。
 * 透传组用例锁住根因修复，原始 JSON Schema 必须原样到达 pi-ai Context，
 * 防止转换层再次出现丢 description 与 enum 的削薄行为。
 */
import { describe, expect, it } from 'bun:test';
import {
  injectNarrationFields,
  stripNarrationFields,
  convertContext,
} from '../src/agent/pi-ai-converter.js';
import type { ToolCall } from '../src/schema/index.js';
import type { Tool } from '../src/tools/index.js';

/** 便捷构造一条内部工具调用 */
function makeCall(args: Record<string, unknown>): ToolCall {
  return {
    id: 'tc1',
    type: 'function',
    function: { name: 'read_file', arguments: args },
  };
}

describe('injectNarrationFields', () => {
  it('required 补进两个注入键，properties 带说明', () => {
    const schema = {
      type: 'object',
      properties: { path: { type: 'string' } },
      required: ['path'],
    };
    const injected = injectNarrationFields(schema);
    expect(injected.required).toContain('_title');
    expect(injected.required).toContain('_intent');
    expect(injected.required).toHaveLength(3);
    expect(
      (injected.properties as Record<string, { type: string }>)['_intent']
    ).toMatchObject({ type: 'string' });
    const title = (injected.properties as Record<string, { description: string }>)['_title'];
    expect(title.description.startsWith('REQUIRED')).toBe(true);
  });

  it('原 schema 不被改动，无 required 时从空起补', () => {
    const schema = { type: 'object', properties: { q: { type: 'string' } } };
    injectNarrationFields(schema);
    expect(schema.required).toBeUndefined();
    expect(Object.keys(schema.properties as object)).toEqual(['q']);
    const injected = injectNarrationFields(schema);
    expect(injected.required).toEqual(['_title', '_intent']);
  });
});

describe('stripNarrationFields', () => {
  it('剥出两键挂到顶层，参数无残留', () => {
    const call = makeCall({
      path: '/a/b.ts',
      _title: '读配置',
      _intent: '确认端口配置',
    });
    stripNarrationFields(call);
    expect(call.function.arguments).toEqual({ path: '/a/b.ts' });
    expect(call.toolTitle).toBe('读配置');
    expect(call.toolIntent).toBe('确认端口配置');
  });

  it('参数无注入键时原样返回不造假', () => {
    const call = makeCall({ path: '/a/b.ts' });
    stripNarrationFields(call);
    expect(call.function.arguments).toEqual({ path: '/a/b.ts' });
    expect(call.toolTitle).toBeUndefined();
    expect(call.toolIntent).toBeUndefined();
  });

  it('空串与非字符串值丢弃不挂', () => {
    const call = makeCall({ _title: '', _intent: 42 });
    stripNarrationFields(call);
    expect(call.function.arguments).toEqual({});
    expect(call.toolTitle).toBeUndefined();
    expect(call.toolIntent).toBeUndefined();
  });
});

describe('convertContext 工具 schema 透传', () => {
  /** 带顶层 description、参数级 description 与 enum 的样例，模拟 MCP 声明的完整 JSON Schema */
  const tool: Tool = {
    name: 'search_tasks',
    description: '搜索任务',
    parameters: {
      type: 'object',
      description: '任务查询的顶层说明',
      properties: {
        status: {
          type: 'string',
          description: '任务状态',
          enum: ['open', 'done'],
        },
      },
      required: ['status'],
    },
    execute: async () => ({ success: true, content: 'ok' }),
  };

  it('description 与 enum 原样到达 Context，注入键同时在场', () => {
    const ctx = convertContext('sys', [], [tool]);
    const params = ctx.tools[0]!.parameters as Record<string, unknown>;
    expect(params.description).toBe('任务查询的顶层说明');
    const props = params.properties as Record<string, Record<string, unknown>>;
    expect(props.status!.description).toBe('任务状态');
    expect(props.status!.enum).toEqual(['open', 'done']);
    expect(props._title).toBeDefined();
    expect(params.required).toContain('_title');
  });
});
