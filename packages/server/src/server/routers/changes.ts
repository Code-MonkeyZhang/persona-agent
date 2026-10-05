/**
 * @fileoverview HTTP routes for the change stream.
 *
 * Routes:
 * - GET /api/changes?since=N - Incremental changes after a sequence number
 */

import { Router } from 'express';
import { getDb } from '../../db/index.js';
import type { SessionChange } from '@persona/shared';
import type { SQLQueryBindings } from 'bun:sqlite';
import { asyncHandler } from './utils.js';

/** changes 表一行。 */
interface ChangeRow {
  seq: number;
  kind: string;
  session_id: string | null;
  data: string;
  created_at: number;
}

export function createChangesRouter(): Router {
  const router = Router();

  /**
   * GET /api/changes?since=N&limit=M - Incremental changes after a sequence number
   *
   * 客户端报自己手里的序号，服务端返回之后按序排列的变化，limit 缺省返回全部。
   * head 始终是服务端当前最新序号，客户端用它判断是否追平，
   * 报来的序号超前时 head 不回显客户端值，避免追平误判。
   */
  router.get(
    '/',
    asyncHandler('CHANGES', 'Error listing changes', (req, res) => {
      const sinceRaw = Number(req.query['since'] ?? 0);
      const since = Number.isFinite(sinceRaw) && sinceRaw > 0 ? sinceRaw : 0;
      const limitRaw = Number(req.query['limit'] ?? 0);
      const limit =
        Number.isFinite(limitRaw) && limitRaw > 0
          ? Math.floor(limitRaw)
          : undefined;

      // limit 已过 Number.isFinite 与取整，拼接无注入面
      const sql = `SELECT * FROM changes WHERE seq > ? ORDER BY seq${
        limit ? ` LIMIT ${limit}` : ''
      }`;
      const changes = getDb()
        .query<ChangeRow, SQLQueryBindings[]>(sql)
        .all(since)
        .map(
          (row): SessionChange => ({
            seq: row.seq,
            kind: row.kind as SessionChange['kind'],
            sessionId: row.session_id,
            data: JSON.parse(row.data),
            createdAt: row.created_at,
          })
        );

      const headRow = getDb()
        .query<
          { max: number | null },
          SQLQueryBindings[]
        >('SELECT MAX(seq) AS max FROM changes')
        .get();
      res.json({ changes, head: headRow?.max ?? 0 });
    })
  );

  return router;
}
