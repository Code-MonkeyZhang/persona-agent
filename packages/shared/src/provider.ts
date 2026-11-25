/** Provider status information (returned by GET /api/providers) */
export interface ProviderStatus {
  id: string;
  name: string;
  models: string[];
  hasAuth: boolean;
  /** Official docs portal URL copied from the provider-level doc field on models.dev */
  docUrl: string;
  /** 支持图片输入的模型 id 列表，前端据此提示非视觉模型，恒为数组 */
  visionModelIds?: string[];
  /** 模型 id 到上下文窗口精确值的映射，前端据此归档成容量徽章，恒为对象 */
  contextWindows?: Record<string, number>;
}
