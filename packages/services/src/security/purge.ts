// Hourly purge of expired security rows (SPEC-208 EF-7, CL-9; ADR-0120, ADR-0213): idempotency
// keys older than 24 hours and rate-limit buckets untouched for 24 hours.
import { deleteExpiredIdempotencyKeys, deleteStaleRateLimits, type DbTx } from '@learny/db';

export const SECURITY_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface SecurityPurgeResult {
  idempotencyKeys: number;
  rateLimitBuckets: number;
}

/** Strictly older than 24 h is removed: a key of 23 h 59 min is kept, one of 24 h + 1 s is not. */
export async function purgeSecurityRows(tx: DbTx, now: Date): Promise<SecurityPurgeResult> {
  const before = new Date(now.getTime() - SECURITY_RETENTION_MS);
  return {
    idempotencyKeys: await deleteExpiredIdempotencyKeys(tx, { before }),
    rateLimitBuckets: await deleteStaleRateLimits(tx, { before }),
  };
}
