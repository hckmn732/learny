// Synchronisation of the offline queue (SPEC-3305 EF-8, ET-1, ET-6, CL-1; SPEC-801 ET-6).
//
// Answers given offline are replayed in batches of at most fifty, oldest first, with the
// `clientId` of each entry as the server's idempotency key. One send at a time: a second caller
// shares the in-flight promise instead of starting a parallel replay (ET-1). An interruption puts
// the `syncing` entries back to `pending`; the server deduplicates the next attempt.
import type { OfflineEntry, OfflineSyncInput, OfflineSyncResponse } from '@learny/contracts';

import type { KeyValueStore } from '../auth/secure-storage';

import {
  pendingInOrder,
  readQueue,
  resetSyncing,
  withoutIds,
  withStatuses,
  writeQueue,
  type OfflineQueue,
} from './queue';

/** Maximum number of entries of one call (ET-6). */
export const SYNC_BATCH_SIZE = 50;

export interface SyncReport {
  /** Entries sent in this run. */
  readonly sent: number;
  readonly applied: number;
  readonly duplicate: number;
  readonly conflict: number;
  readonly rejected: number;
  /** Entries still waiting after the run (pending or rejected). */
  readonly remaining: number;
  /** True when the network refused the batch; the entries stay pending. */
  readonly failed: boolean;
}

export interface SyncDependencies {
  readonly storage: KeyValueStore;
  /** `POST /sync/offline-answers` of the API client. */
  readonly send: (input: OfflineSyncInput) => Promise<OfflineSyncResponse>;
}

const EMPTY: SyncReport = {
  sent: 0,
  applied: 0,
  duplicate: 0,
  conflict: 0,
  rejected: 0,
  remaining: 0,
  failed: false,
};

function pendingCount(queue: OfflineQueue): number {
  return queue.items.filter((item) => (item.status ?? 'pending') === 'pending').length;
}

async function run(deps: SyncDependencies): Promise<SyncReport> {
  const current = resetSyncing(await readQueue(deps.storage));
  const batch = pendingInOrder(current).slice(0, SYNC_BATCH_SIZE);
  if (batch.length === 0) return { ...EMPTY, remaining: pendingCount(current) };

  const ids = batch.map((item) => item.id);
  await writeQueue(deps.storage, withStatuses(current, ids, 'syncing'));

  let response: OfflineSyncResponse;
  try {
    response = await deps.send({ entries: batch.map((item) => item.payload as OfflineEntry) });
  } catch {
    // CL-1 — the network dropped: the entries return to `pending` and will be replayed.
    const interrupted = resetSyncing(await readQueue(deps.storage));
    await writeQueue(deps.storage, interrupted);
    return { ...EMPTY, sent: batch.length, remaining: pendingCount(interrupted), failed: true };
  }

  const applied: string[] = [];
  const rejected: string[] = [];
  let duplicate = 0;
  let conflict = 0;
  for (const result of response.results) {
    if (result.status === 'applied') {
      applied.push(result.clientId);
    } else if (result.status === 'duplicate') {
      duplicate += 1;
      applied.push(result.clientId);
    } else if (result.status === 'conflict') {
      // CL-3 — the server makes faith (session closed elsewhere): the entry is dropped.
      conflict += 1;
      applied.push(result.clientId);
    } else {
      rejected.push(result.clientId);
    }
  }

  const settled = withoutIds(await readQueue(deps.storage), applied);
  const next = withStatuses(settled, rejected, 'rejected');
  await writeQueue(deps.storage, next);

  return {
    sent: batch.length,
    applied: applied.length - duplicate - conflict,
    duplicate,
    conflict,
    rejected: rejected.length,
    remaining: pendingCount(next),
    failed: false,
  };
}

let inFlight: Promise<SyncReport> | null = null;

/**
 * Sends the pending entries, one batch at a time until the queue is empty or the network fails
 * (EF-8). Concurrent callers share the same run: the server never receives the batch twice.
 */
export function syncOfflineQueue(deps: SyncDependencies): Promise<SyncReport> {
  if (inFlight !== null) return inFlight;
  inFlight = (async () => {
    let report = await run(deps);
    const total = { ...report };
    while (!report.failed && report.remaining > 0) {
      report = await run(deps);
      total.sent += report.sent;
      total.applied += report.applied;
      total.duplicate += report.duplicate;
      total.conflict += report.conflict;
      total.rejected += report.rejected;
      total.failed = report.failed;
      total.remaining = report.remaining;
    }
    return { ...total, remaining: report.remaining };
  })().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/** True when a synchronisation is running (the screen keeps its band until it ends). */
export function isSyncing(): boolean {
  return inFlight !== null;
}
