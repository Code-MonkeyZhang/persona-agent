import { z } from 'zod';

/** Model configuration schema */
export const ModelConfigSchema = z.object({
  provider: z.string(),
  model: z.string(),
});

/** Model configuration type */
export type ModelConfig = z.infer<typeof ModelConfigSchema>;
