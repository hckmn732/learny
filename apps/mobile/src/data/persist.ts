// Persistence of the query cache (SPEC-3003 EF-4, EF-6, CL-4, CL-5; canevas § 4).
//
// The cache is dehydrated into the encrypted MMKV instance (same store as the session), under a
// key of its own, and keyed by user and by application version:
// - a new application version changes the `buster`, so the previous schema is ignored and the
//   cache is rebuilt instead of crashing (CL-5);
// - another account on the same device never reads the cache of the first one (EF-6, § 15).
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistedClient, Persister } from '@tanstack/react-query-persist-client';

import type { KeyValueStore } from '../auth/secure-storage';

/** Key of the dehydrated cache inside the encrypted store. */
export const QUERY_CACHE_STORAGE_KEY = 'learny.query-cache.v1';
/** Maximum age of a restored cache: beyond it the screens refetch (EF-4). */
export const QUERY_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Writes are batched: a burst of queries produces one write (MMKV stays fast). */
export const QUERY_CACHE_THROTTLE_MS = 250;

/** Storage interface expected by the async persister (`@tanstack/query-async-storage-persister`). */
export interface AsyncKeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<unknown>;
  removeItem(key: string): Promise<void>;
}

/** Adapts a synchronous or asynchronous store to the persister contract. */
export function createAsyncStore(store: KeyValueStore): AsyncKeyValueStore {
  return {
    async getItem(key) {
      return (await store.getItem(key)) ?? null;
    },
    async setItem(key, value) {
      await store.setItem(key, value);
    },
    async removeItem(key) {
      await store.removeItem(key);
    },
  };
}

/**
 * Cache discriminator (CL-5, § 15): the application version, then the account. Changing either
 * invalidates the persisted cache — the persister ignores it instead of restoring a foreign or
 * obsolete schema.
 */
export function cacheBuster(appVersion: string, userId: string | null): string {
  const version = appVersion.trim() === '' ? '0.0.0' : appVersion.trim();
  return `${version}:${userId ?? 'anonymous'}`;
}

export interface QueryPersistOptions {
  readonly persister: Persister;
  readonly maxAge: number;
  readonly buster: string;
  /** Never restore a mutation: only the queries are dehydrated (EF-4). */
  readonly dehydrateOptions: { shouldDehydrateMutation: () => boolean };
}

/** Options passed to `PersistQueryClientProvider` (EF-4). */
export function createQueryPersistOptions(options: {
  storage: AsyncKeyValueStore;
  appVersion: string;
  userId: string | null;
}): QueryPersistOptions {
  const persister = createAsyncStoragePersister({
    storage: options.storage,
    key: QUERY_CACHE_STORAGE_KEY,
    throttleTime: QUERY_CACHE_THROTTLE_MS,
  });
  return {
    persister,
    maxAge: QUERY_CACHE_MAX_AGE_MS,
    buster: cacheBuster(options.appVersion, options.userId),
    dehydrateOptions: { shouldDehydrateMutation: () => false },
  };
}

let restored = false;
const restoredListeners = new Set<() => void>();

/** Called by the provider once a persisted cache was restored (proof of CL-4, `sdd-cache-status`). */
export function markCacheRestored(): void {
  restored = true;
  for (const listener of restoredListeners) listener();
}

export function isCacheRestored(): boolean {
  return restored;
}

/** Subscribes to the restore event (`useSyncExternalStore` of the demonstration page). */
export function subscribeCacheRestored(listener: () => void): () => void {
  restoredListeners.add(listener);
  return () => {
    restoredListeners.delete(listener);
  };
}

/** Resets the flag (tests, sign-out). */
export function resetCacheRestored(): void {
  restored = false;
  for (const listener of restoredListeners) listener();
}

/** Reads the persisted client without restoring it (tests, demonstration page). */
export async function readPersistedClient(
  storage: AsyncKeyValueStore,
): Promise<PersistedClient | null> {
  try {
    const raw = await storage.getItem(QUERY_CACHE_STORAGE_KEY);
    return raw === null ? null : (JSON.parse(raw) as PersistedClient);
  } catch {
    return null;
  }
}
