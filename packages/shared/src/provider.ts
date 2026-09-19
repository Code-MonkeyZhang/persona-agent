/** Provider status information (returned by GET /api/providers) */
export interface ProviderStatus {
  id: string;
  name: string;
  models: string[];
  hasAuth: boolean;
  /** Official docs portal URL copied from the provider-level doc field on models.dev */
  docUrl: string;
}
