/**
 * @fileoverview 常驻工具注册表，三类工具来源的唯一事实源。
 *
 * 条目单位是工具一组，功能清单挂组下。消费方一律读 snapshot 派生，
 * 回写只经 register、update、unregister。注册顺序即快照顺序，
 * 顺序稳定保护服务商对工具表顺序敏感的提示词缓存。
 */

import { Logger } from '../util/logger.js';

/** 条目来源标记，渲染分支与装配分流共用 */
export type ToolEntryKind = 'builtin' | 'mcp' | 'app';

/** 条目四态，内置条目恒为 connected 不参与状态机 */
export type ToolEntryStatus =
  | 'connecting'
  | 'connected'
  | 'needs_auth'
  | 'failed';

/** 功能清单项，name 是模型侧全名，shortName 供界面显示 */
export interface RegistryFunction {
  name: string;
  shortName: string;
  description?: string;
  /** 英文覆盖，仅内置条目携带，投影按请求语言择一 */
  descriptionEn?: string;
}

/** 条目附带的展示与状态元数据 */
export interface RegistryEntryMeta {
  url?: string;
  logoUrl?: string;
  instructions?: string;
  /** 详情文档的英文整篇覆盖，仅内置条目携带 */
  instructionsEn?: string;
  author?: string;
  error?: string;
  oauthUrl?: string;
}

/** 注册表条目，三类来源统一形状 */
export interface RegistryEntry {
  id: string;
  kind: ToolEntryKind;
  name: string;
  /** 显示名的英文覆盖，仅内置条目携带 */
  nameEn?: string;
  description?: string;
  /** 条目描述的英文覆盖，仅内置条目携带 */
  descriptionEn?: string;
  status: ToolEntryStatus;
  functions: RegistryFunction[];
  meta?: RegistryEntryMeta;
}

/** 显示文案的请求语言，决定投影优先取覆盖字段还是基底字段 */
export type DisplayLang = 'zh-CN' | 'en';

/**
 * 按请求语言挑一份显示文案。
 * 语言是英文且覆盖存在取覆盖，其余一切情况回落中文基底，
 * 外部条目不带覆盖字段，任何语言都显示服务端原文。
 * @param base 中文基底字段
 * @param override 英文覆盖字段，仅内置条目携带
 * @param lang 客户端随请求携带的界面语言
 */
export function pickDisplayText(
  base: string | undefined,
  override: string | undefined,
  lang: DisplayLang
): string | undefined {
  return lang === 'en' && override !== undefined ? override : base;
}

/** 条目变更监听者，参数是变更条目的 id */
export type ToolRegistryListener = (id: string) => void;

/** 深拷贝一个条目，快照与登记共用，消费方拿到手改不动正本 */
function cloneEntry(entry: RegistryEntry): RegistryEntry {
  return {
    ...entry,
    functions: entry.functions.map((fn) => ({ ...fn })),
    meta: entry.meta ? { ...entry.meta } : undefined,
  };
}

export class ToolRegistry {
  private entries = new Map<string, RegistryEntry>();
  private listeners = new Set<ToolRegistryListener>();

  /**
   * 登记一个条目，id 重复时抛错拒绝静默覆盖。
   * 装载路径捕获该错误后把条目落失败态，不阻断其余条目启动。
   */
  register(entry: RegistryEntry): void {
    if (this.entries.has(entry.id)) {
      throw new Error(`Tool registry entry already exists: ${entry.id}`);
    }
    this.entries.set(entry.id, cloneEntry(entry));
    Logger.log(
      'TOOLS',
      `Registered '${entry.id}' kind=${entry.kind} functions=${entry.functions.length}`
    );
    this.notify(entry.id);
  }

  /** 回注式更新，条目不存在时返回 false */
  update(id: string, patch: Partial<Omit<RegistryEntry, 'id'>>): boolean {
    const current = this.entries.get(id);
    if (!current) return false;
    this.entries.set(
      id,
      cloneEntry({
        ...current,
        ...patch,
        functions: patch.functions ?? current.functions,
        meta: patch.meta ?? current.meta,
      })
    );
    this.notify(id);
    return true;
  }

  /** 注销条目，不存在时返回 false */
  unregister(id: string): boolean {
    const removed = this.entries.delete(id);
    if (removed) {
      Logger.log('TOOLS', `Unregistered '${id}'`);
      this.notify(id);
    }
    return removed;
  }

  get(id: string): RegistryEntry | undefined {
    return this.entries.get(id);
  }

  /** 按注册顺序返回全部条目的深拷贝数组，消费方只读 */
  snapshot(): RegistryEntry[] {
    return Array.from(this.entries.values()).map(cloneEntry);
  }

  /** 订阅条目变更，返回退订函数 */
  subscribe(listener: ToolRegistryListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(id: string): void {
    for (const listener of this.listeners) {
      listener(id);
    }
  }
}

/** 全局单例，随 server 生命周期常驻 */
export const toolRegistry = new ToolRegistry();
