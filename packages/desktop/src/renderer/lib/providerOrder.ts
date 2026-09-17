/**
 * @file src/renderer/lib/providerOrder.ts
 * @description 供应商排序纯函数，供模型选择器与供应商面板共用
 */

/** 参与排序的供应商需携带的最小字段 */
export interface OrderableProvider {
  id: string;
  name: string;
}

/**
 * 供应商排序：当前选中的供应商排最前，其余已配置密钥的整组次之，剩余按名称字母序
 * @param providers 待排序的供应商列表
 * @param selectedId 当前选中的供应商 id
 * @param configuredIds 已配置密钥的供应商 id 集合
 */
export function orderProviders<T extends OrderableProvider>(
  providers: T[],
  selectedId: string | undefined,
  configuredIds: ReadonlySet<string>
): T[] {
  return [...providers].sort((a, b) => {
    if (a.id === selectedId || b.id === selectedId) {
      if (a.id === selectedId && b.id === selectedId) return 0;
      return a.id === selectedId ? -1 : 1;
    }
    const aConfigured = configuredIds.has(a.id);
    const bConfigured = configuredIds.has(b.id);
    if (aConfigured !== bConfigured) return aConfigured ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}
