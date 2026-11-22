// Offline queue of the mutations (SPEC-3003 EF-6, ET-3; filled by SPEC-3305).
//
// This specification creates the queue empty and purges it on sign-out; SPEC-3305 enqueues the
// answers given offline and replays them with their `Idempotency-Key` once the network returns.
// The queue lives in the encrypted store, next to the cache, and never holds an access token.
import type { KeyValueStore } from '../auth/secure-storage';

/** Key of the queue inside the encrypted store. */
export const OFFLINE_QUEUE_KEY = 'learny.offline-queue.v1';
/** Schema version of the queue: a bump drops an incompatible queue instead of crashing. */
export const OFFLINE_QUEUE_VERSION = 1;

export interface OfflineQueueItem {
  /** Identifier of the intent, stable across a restart. */
  readonly id: string;
  /** Kind of mutation (`answer`, `note`, `session-check`…), decided by SPEC-3305. */
  readonly kind: string;
  /** `Idempotency-Key` sent with every replay (ET-3, BR-PLA-08). */
  readonly idempotencyKey: string;
  /** Instant of the intent, ISO 8601, read from the application clock. */
  readonly createdAt: string;
  /** Body of the mutation, already validated by its contract. */
  readonly payload: unknown;
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

/** Appends one intent, keeping the existing ones (SPEC-3305 uses it). */
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
