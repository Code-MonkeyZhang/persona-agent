/**
 * @file src/renderer/lib/providerOrder.ts
 * @description 供应商排序纯函数，orderProviders 供供应商面板用，orderForSelector 供模型选择器用
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

/**
 * 模型选择器的供应商排位，heads 按优先级从高到低给出要置顶的供应商，同一家只出现一次
 * @param providers 已配置密钥的供应商，按接口下发的配置顺序传入
 * @param heads 依次是当前在用的、Agent 默认的、上次使用的供应商 id，缺省的位次跳过
 * @returns 置顶供应商在前、其余保持传入顺序的新数组
 */
export function orderForSelector<T extends OrderableProvider>(
  providers: T[],
  ...heads: (string | undefined)[]
): T[] {
  const front: T[] = [];
  for (const id of heads) {
    const hit = providers.find((p) => p.id === id);
    if (hit && !front.includes(hit)) front.push(hit);
  }
  return [...front, ...providers.filter((p) => !front.includes(p))];
}
