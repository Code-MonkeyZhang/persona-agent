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
}
