/**
 * Marketplace 清单条目的 schema 与类型。
 * 一份清单（skills/index.json）是一个由此条目组成的数组，前后端共用。
 */
import { z } from 'zod';

export const MarketplaceEntrySchema = z.object({
  name: z.string().min(1),
  description: z.string(),
  author: z.string(),
  homepage: z.string().url(),
  version: z.string(),
  path: z.string().min(1),
});

export type MarketplaceEntry = z.infer<typeof MarketplaceEntrySchema>;
