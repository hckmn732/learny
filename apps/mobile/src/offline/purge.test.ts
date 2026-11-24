// Vitest [SPEC-3003] — purge of the account data (EF-6, CL-2).
import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import type { KeyValueStore } from '../auth/secure-storage';
import { QUERY_CACHE_STORAGE_KEY } from '../data/persist';

import { purgeUserData } from './purge';
import { OFFLINE_QUEUE_KEY } from './queue';


function memoryStore(): KeyValueStore & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}

describe('[SPEC-3003] purge des données du compte (EF-6)', () => {
  it('vide le cache Query, le cache persisté et la file hors ligne (EF-6)', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(['me'], { firstName: 'Alex' });
    queryClient.setQueryData(['home'], { ok: true });
    const storage = memoryStore();
    await storage.setItem(QUERY_CACHE_STORAGE_KEY, '{"clientState":{}}');
    await storage.setItem(OFFLINE_QUEUE_KEY, '{"version":1,"items":[]}');

    const result = await purgeUserData({ queryClient, storage });

    expect(result).toEqual({
      cacheCleared: true,
      persistedCacheCleared: true,
      queueCleared: true,
    });
    expect(queryClient.getQueryCache().getAll()).toHaveLength(0);
    expect(storage.values.has(QUERY_CACHE_STORAGE_KEY)).toBe(false);
    expect(storage.values.has(OFFLINE_QUEUE_KEY)).toBe(false);
  });

  it('est idempotente : une seconde purge ne trouve plus rien', async () => {
    const queryClient = new QueryClient();
    const storage = memoryStore();

    const first = await purgeUserData({ queryClient, storage });
    const second = await purgeUserData({ queryClient, storage });

    expect(first).toEqual({ cacheCleared: false, persistedCacheCleared: false, queueCleared: false });
    expect(second).toEqual(first);
  });

  it('ne touche pas aux autres clés du magasin chiffré (session conservée jusqu’au sign-out)', async () => {
    const queryClient = new QueryClient();
    const storage = memoryStore();
    await storage.setItem('learny.session.v1', 'session');

    await purgeUserData({ queryClient, storage });

    expect(storage.values.get('learny.session.v1')).toBe('session');
  });
});
