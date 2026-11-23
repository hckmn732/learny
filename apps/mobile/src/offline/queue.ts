// Offline queue of the mutations (SPEC-3003 EF-6, ET-3; filled by SPEC-3305).
//
// This specification created the queue and purges it on sign-out; SPEC-3305 enqueues the answers
// given offline and replays them once the network returns. The queue lives in the encrypted store,
// next to the cache, and never holds an access token.
//
// Ordering is by `answeredAt` (the `createdAt` of the entry, read from the application clock): the
// synchronisation sends the oldest answers first, in batches of fifty (ET-1, ET-6).
import type { OfflineEntry } from '@learny/contracts';

import type { KeyValueStore } from '../auth/secure-storage';

/** Key of the queue inside the encrypted store. */
export const OFFLINE_QUEUE_KEY = 'learny.offline-queue.v1';
/** Schema version of the queue: a bump drops an incompatible queue instead of crashing. */
export const OFFLINE_QUEUE_VERSION = 1;

/** Local status of one queued intent (ET-1); never sent to the server. */
export type OfflineQueueItemStatus = 'pending' | 'syncing' | 'rejected';

export interface OfflineQueueItem {
  /** Identifier of the intent, stable across a restart; the `clientId` of the entry. */
  readonly id: string;
  /** Kind of mutation (`answer`, `complete`), the `kind` of the entry. */
  readonly kind: string;
  /** `Idempotency-Key` of a replay (ET-3, BR-PLA-08); the `clientId` is the server's idempotency. */
  readonly idempotencyKey: string;
  /** Instant of the intent, ISO 8601, read from the application clock (`answeredAt`). */
  readonly createdAt: string;
  /** Body of the mutation: the `OfflineEntry` of the offline contract (ET-4). */
  readonly payload: unknown;
  /** Local status (ET-1): pending, being sent, or refused by the server. */
  readonly status?: OfflineQueueItemStatus;
}

export interface OfflineQueue {
  readonly version: number;
  readonly items: readonly OfflineQueueItem[];
}

/** Empty queue of a fresh account (EF-6). */
export function emptyQueue(): OfflineQueue {
  return { version: OFFLINE_QUEUE_VERSION, items: [] };
}

/** Parses a stored queue; anything unreadable or from another schema yields an empty queue. */
export function parseQueue(raw: string | null): OfflineQueue {
  if (raw === null || raw.trim() === '') return emptyQueue();
  try {
    const value = JSON.parse(raw) as { version?: unknown; items?: unknown };
    if (value.version !== OFFLINE_QUEUE_VERSION || !Array.isArray(value.items)) return emptyQueue();
    const items = value.items.filter((item): item is OfflineQueueItem => {
      if (typeof item !== 'object' || item === null) return false;
      const candidate = item as Record<string, unknown>;
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.kind === 'string' &&
        typeof candidate.idempotencyKey === 'string' &&
        typeof candidate.createdAt === 'string'
      );
    });
    return { version: OFFLINE_QUEUE_VERSION, items };
  } catch {
    return emptyQueue();
  }
}

/** Current queue of the device (EF-6). */
export async function readQueue(storage: KeyValueStore): Promise<OfflineQueue> {
  return parseQueue(await storage.getItem(OFFLINE_QUEUE_KEY));
}

export async function writeQueue(storage: KeyValueStore, queue: OfflineQueue): Promise<void> {
  await storage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
}

/** Appends one intent, keeping the existing ones. */
export async function enqueue(
  storage: KeyValueStore,
  item: OfflineQueueItem,
): Promise<OfflineQueue> {
  const queue = await readQueue(storage);
  const next: OfflineQueue = { version: OFFLINE_QUEUE_VERSION, items: [...queue.items, item] };
  await writeQueue(storage, next);
  return next;
}

/** Empties the queue (sign-out, EF-6). */
export async function clearQueue(storage: KeyValueStore): Promise<void> {
  await storage.removeItem(OFFLINE_QUEUE_KEY);
}

/** True when the entry still has to be sent (ET-1). */
export function isPending(item: OfflineQueueItem): boolean {
  return (item.status ?? 'pending') === 'pending';
}

/** Pending entries, oldest first (ET-1, ET-6). */
export function pendingInOrder(queue: OfflineQueue): OfflineQueueItem[] {
  return queue.items
    .filter(isPending)
    .slice()
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
}

/** Entries interrupted mid-flight, back to `pending` (CL-1). */
export function resetSyncing(queue: OfflineQueue): OfflineQueue {
  return withStatuses(
    queue,
    queue.items.filter((item) => item.status === 'syncing').map((item) => item.id),
    'pending',
  );
}

/** Applies one status to several entries and returns a new queue. */
export function withStatuses(
  queue: OfflineQueue,
  ids: readonly string[],
  status: OfflineQueueItemStatus,
): OfflineQueue {
  const wanted = new Set(ids);
  return {
    version: OFFLINE_QUEUE_VERSION,
    items: queue.items.map((item) => (wanted.has(item.id) ? { ...item, status } : item)),
  };
}

/** Removes entries the server applied (or declared duplicates), and returns the new queue. */
export function withoutIds(queue: OfflineQueue, ids: readonly string[]): OfflineQueue {
  const dropped = new Set(ids);
  return {
    version: OFFLINE_QUEUE_VERSION,
    items: queue.items.filter((item) => !dropped.has(item.id)),
  };
}

/** Number of entries the server refused, for the toast of EF-8. */
export function rejectedCount(queue: OfflineQueue): number {
  return queue.items.filter((item) => item.status === 'rejected').length;
}

/** Body of a queued answer or closure, built from the offline contract (ET-4). */
export function queuedEntry(entry: OfflineEntry): OfflineQueueItem {
  return {
    id: entry.clientId,
    kind: entry.kind,
    idempotencyKey: `offline:${entry.clientId}`,
    createdAt: entry.answeredAt,
    payload: entry,
    status: 'pending',
  };
}
