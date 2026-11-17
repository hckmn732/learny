// Retention of the offline synchronisation receipts (SPEC-801 ET-6, ADR-0200): older than 30 days
// are removed by the nightly cron. Shared by the job and the integration tests.
import { sql } from 'drizzle-orm';

import type { DbTx } from '../client';

export const OFFLINE_RECEIPT_RETENTION_DAYS = 30;

/** Strictly older than 30 days is removed; the purge is idempotent. */
export async function purgeOfflineReceipts(
  tx: DbTx,
  now: Date,
  retentionDays = OFFLINE_RECEIPT_RETENTION_DAYS,
): Promise<number> {
  const before = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const rows = await tx.execute<{ client_id: string }>(sql`
    delete from public.offline_sync_receipts
    where created_at < ${before.toISOString()}::timestamptz
    returning client_id::text as client_id
  `);
  return rows.length;
}
