/**
 * @fileoverview MCP 工具 schema 清洗测试：引用展开、循环防护、既有压平逻辑回归。
 */

import { describe, it, expect } from 'bun:test';
import { normalizeToolSchema } from '../src/mcp/connection.js';
import type { JsonSchema } from '../src/tools/base.js';

describe('normalizeToolSchema', () => {
  /** 测试 items 里的引用被展开成完整定义，输出不含任何引用 */
  it('should dereference refs inside items before cleaning', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        tasks: {
          type: 'array',
          items: { $ref: '#/$defs/OpenMoveProject' },
        },
      },
      $defs: {
        OpenMoveProject: {
          type: 'object',
          properties: {
            id: { type: 'string', description: '任务 id' },
          },
        },
      },
    };

    const normalized = normalizeToolSchema(schema);

    expect(JSON.stringify(normalized)).not.toContain('$ref');
    const items = (
      normalized['properties'] as Record<string, Record<string, unknown>>
    )['tasks']!['items'];
    expect(items).toEqual({
      type: 'object',
      properties: { id: { type: 'string', description: '任务 id' } },
    });
  });

  /** 测试旧式 definitions 指针同样展开 */
  it('should dereference legacy definitions pointers', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        filter: { $ref: '#/definitions/Legacy' },
      },
      definitions: {
        Legacy: { type: 'string', description: '过滤条件' },
      },
    };

    const normalized = normalizeToolSchema(schema);

    expect(JSON.stringify(normalized)).not.toContain('$ref');
    const filter = (
      normalized['properties'] as Record<string, Record<string, unknown>>
    )['filter']!;
    expect(filter['type']).toBe('string');
    expect(filter['description']).toBe('过滤条件');
  });

  /** 测试 anyOf 里引用加 null 的 Optional 形状，展开后压平照常工作 */
  it('should keep anyOf unwrapping working on dereferenced schemas', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        project: {
          anyOf: [{ $ref: '#/$defs/Project' }, { type: 'null' }],
        },
      },
      $defs: {
        Project: { type: 'string' },
      },
    };

    const normalized = normalizeToolSchema(schema);

    expect(JSON.stringify(normalized)).not.toContain('$ref');
    const project = (
      normalized['properties'] as Record<string, Record<string, unknown>>
    )['project']!;
    expect(project['type']).toBe('string');
  });

  /** 测试自引用定义不死循环，循环处的引用被剥离 */
  it('should terminate on self-referencing definitions', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        node: { $ref: '#/$defs/TreeNode' },
      },
      $defs: {
        TreeNode: {
          type: 'object',
          properties: {
            children: {
              type: 'array',
              items: { $ref: '#/$defs/TreeNode' },
            },
          },
        },
      },
    };

    const normalized = normalizeToolSchema(schema);

    expect(JSON.stringify(normalized)).not.toContain('$ref');
    const node = (
      normalized['properties'] as Record<string, Record<string, unknown>>
    )['node']!;
    expect(node['type']).toBe('object');
  });

  /** 测试解不开的引用被剥离，不留悬空指针 */
  it('should strip unresolvable refs and keep siblings', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        x: { $ref: '#/$defs/Missing', description: '参数 x' },
      },
    };

    const normalized = normalizeToolSchema(schema);

    expect(JSON.stringify(normalized)).not.toContain('$ref');
    const x = (
      normalized['properties'] as Record<string, Record<string, unknown>>
    )['x']!;
    expect(x).toEqual({ description: '参数 x' });
  });

  /** 测试不带引用的 schema 输出与既有行为逐字段一致 */
  it('should leave ref-free schemas identical to legacy behavior', () => {
    const schema: JsonSchema = {
      type: 'object',
      properties: {
        query: { type: 'string', title: 'Search Query' },
        tags: { type: 'array', items: { type: 'string' } },
        limit: { type: 'integer', default: 10 },
        mode: { type: 'string', enum: ['fast', 'slow'] },
      },
      required: ['query'],
    };

    expect(normalizeToolSchema(schema)).toEqual({
      type: 'object',
      properties: {
        query: { type: 'string', description: 'search query' },
        tags: { type: 'array', items: { type: 'string' } },
        limit: { type: 'integer', default: 10 },
        mode: { type: 'string', enum: ['fast', 'slow'] },
      },
      required: ['query'],
    });
  });
});
