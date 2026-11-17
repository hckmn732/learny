// Synchronisation of the offline queue (SPEC-801 EF-8, ET-9). Shared by the page and the service
// worker: no DOM-only import, the `fetch` implementation and the clock are injected. A
// `navigator.locks` lock (or an in-memory flag) prevents two concurrent runs; a network failure
// returns every `syncing` entry to `pending` and the next trigger retries, without a loop.
import {
  OfflineSyncResponseSchema,
  type OfflineEntry,
  type OfflineSyncResponse,
} from '@learny/contracts';
import { clock } from '@learny/core';

import {
  deleteQueueEntry,
  notifyQueueChanged,
  pendingEntries,
  purgeRejected,
  putQueueEntry,
} from './queue';

export interface SyncQueueOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  lockName?: string;
}

export interface SyncQueueResult {
  synced: number;
  conflicts: number;
  rejected: number;
  ran: boolean;
}

const BATCH_SIZE = 50;
let inMemoryLock = false;

function entryPayload(entry: Awaited<ReturnType<typeof pendingEntries>>[number]): OfflineEntry {
  if (entry.kind === 'complete') {
    return {
      clientId: entry.clientId,
      kind: 'complete',
      formationId: entry.formationId,
      sessionId: entry.sessionId,
      answeredAt: entry.answeredAt,
    };
  }
  return {
    clientId: entry.clientId,
    kind: 'answer',
    formationId: entry.formationId,
    sessionId: entry.sessionId,
    position: entry.position ?? 0,
    answeredAt: entry.answeredAt,
    ...(entry.brickVersionId === undefined ? {} : { brickVersionId: entry.brickVersionId }),
    ...(entry.skipped === true ? { skipped: true as const } : {}),
    ...(entry.response === undefined ? {} : { response: entry.response }),
    ...(entry.timeMs === undefined ? {} : { timeMs: entry.timeMs }),
    ...(entry.selfGrade === undefined ? {} : { selfGrade: entry.selfGrade }),
  };
}

async function flush(options: SyncQueueOptions): Promise<SyncQueueResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => clock.now());
  const result: SyncQueueResult = { synced: 0, conflicts: 0, rejected: 0, ran: true };
  let entries = await pendingEntries();
  while (entries.length > 0) {
    const batch = entries.slice(0, BATCH_SIZE);
    for (const entry of batch) await putQueueEntry({ ...entry, status: 'syncing' });
    let parsed: OfflineSyncResponse;
    try {
      const response = await fetchImpl('/api/v1/sync/offline-answers', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ entries: batch.map(entryPayload) }),
      });
      if (!response.ok) throw new Error(`synchronisation refusée (${String(response.status)})`);
      parsed = OfflineSyncResponseSchema.parse(await response.json());
    } catch {
      for (const entry of batch) {
        await putQueueEntry({ ...entry, status: 'pending', attempts: entry.attempts + 1 });
      }
      return { ...result, ran: true };
    }
    const byClient = new Map(parsed.results.map((item) => [item.clientId, item]));
    for (const entry of batch) {
      const outcome = byClient.get(entry.clientId);
      if (outcome === undefined || outcome.status === 'applied' || outcome.status === 'duplicate') {
        await deleteQueueEntry(entry.clientId);
        result.synced += 1;
      } else if (outcome.status === 'conflict') {
        await deleteQueueEntry(entry.clientId);
        result.conflicts += 1;
      } else {
        await putQueueEntry({
          ...entry,
          status: 'rejected',
          attempts: entry.attempts + 1,
          ...(outcome.code === undefined ? {} : { lastError: outcome.code }),
        });
        result.rejected += 1;
      }
    }
    if (parsed.results.length < batch.length) break;
    entries = (await pendingEntries()).filter(
      (entry) => !batch.some((sent) => sent.clientId === entry.clientId),
    );
  }
  await purgeRejected(now());
  notifyQueueChanged();
  return result;
}

/**
 * EF-8 — sends the pending entries in `answeredAt` order, 50 at most per call. Concurrent calls
 * share one run (the second returns `ran: false`).
 */
export async function syncQueue(options: SyncQueueOptions = {}): Promise<SyncQueueResult> {
  const locks = (globalThis.navigator as { locks?: LockManager } | undefined)?.locks;
  const lockName = options.lockName ?? 'learny-sync';
  if (locks !== undefined) {
    const result = await locks.request(lockName, { ifAvailable: true }, async (lock) => {
      if (lock === null) return null;
      return flush(options);
    });
    return result ?? { synced: 0, conflicts: 0, rejected: 0, ran: false };
  }
  if (inMemoryLock) return { synced: 0, conflicts: 0, rejected: 0, ran: false };
  inMemoryLock = true;
  try {
    return await flush(options);
  } finally {
    inMemoryLock = false;
  }
}
