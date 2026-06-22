/** Provider status information (returned by GET /api/providers) */
export interface ProviderStatus {
  id: string;
  name: string;
  models: string[];
  hasAuth: boolean;
}
