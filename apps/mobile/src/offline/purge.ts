// Purge of the data of an account (SPEC-3003 EF-6, CL-2; ADR-3008 § 6).
//
// Called on sign-out and on a refused renewal: the query cache, its persisted copy and the offline
// queue are removed, so no screen of the next account can read the data of the previous one
// (§ 15, EF-6). The session itself is removed by the Auth client; this module never touches it.
import type { QueryClient } from '@tanstack/react-query';

import type { KeyValueStore } from '../auth/secure-storage';
import { QUERY_CACHE_STORAGE_KEY } from '../data/persist';

import { clearQueue, OFFLINE_QUEUE_KEY } from './queue';

export interface PurgeDependencies {
  readonly queryClient: QueryClient;
  /** The encrypted store: persisted cache and offline queue live there (EF-4, EF-6). */
  readonly storage: KeyValueStore;
}

export interface PurgeResult {
  /** True when the in-memory cache had entries and was cleared. */
  readonly cacheCleared: boolean;
  /** True when a persisted cache was removed. */
  readonly persistedCacheCleared: boolean;
  /** True when the offline queue was removed. */
  readonly queueCleared: boolean;
}

/** Removes every trace of the account from the device (EF-6). */
export async function purgeUserData(deps: PurgeDependencies): Promise<PurgeResult> {
  const cacheCleared = deps.queryClient.getQueryCache().getAll().length > 0;
  deps.queryClient.clear();

  const persistedCacheCleared = (await deps.storage.getItem(QUERY_CACHE_STORAGE_KEY)) !== null;
  await deps.storage.removeItem(QUERY_CACHE_STORAGE_KEY);

  const queueCleared = (await deps.storage.getItem(OFFLINE_QUEUE_KEY)) !== null;
  await clearQueue(deps.storage);

  return { cacheCleared, persistedCacheCleared, queueCleared };
}
