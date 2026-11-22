// Vitest [SPEC-3003] — persistence of the query cache (EF-4, CL-5).
import { describe, expect, it } from 'vitest';

import type { KeyValueStore } from '../auth/secure-storage';

import {
  cacheBuster,
  createAsyncStore,
  createQueryPersistOptions,
  isCacheRestored,
  markCacheRestored,
  QUERY_CACHE_MAX_AGE_MS,
  QUERY_CACHE_STORAGE_KEY,
  readPersistedClient,
  resetCacheRestored,
  restoredQueryCount,
} from './persist';

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

describe('[SPEC-3003] cache persistant (EF-4, CL-5)', () => {
  it('isole le cache par version de l’application et par compte (CL-5, § 15)', () => {
    expect(cacheBuster('1.0.0', 'u-alex')).toBe('1.0.0:u-alex');
    expect(cacheBuster('1.0.0', null)).toBe('1.0.0:anonymous');
    // A new application version drops the persisted schema instead of restoring it (CL-5).
    expect(cacheBuster('1.0.1', 'u-alex')).not.toBe(cacheBuster('1.0.0', 'u-alex'));
    // Another account never reads the cache of the first one.
    expect(cacheBuster('1.0.0', 'u-camille')).not.toBe(cacheBuster('1.0.0', 'u-alex'));
    expect(cacheBuster('  ', 'u-alex')).toBe('0.0.0:u-alex');
  });

  it('configure le persistant : âge maximal 24 h, aucune mutation déshydratée', () => {
    const storage = createAsyncStore(memoryStore());
    const options = createQueryPersistOptions({
      storage,
      appVersion: '1.0.0',
      userId: 'u-alex',
    });

    expect(options.maxAge).toBe(QUERY_CACHE_MAX_AGE_MS);
    expect(options.maxAge).toBe(24 * 60 * 60 * 1000);
    expect(options.buster).toBe('1.0.0:u-alex');
    expect(options.dehydrateOptions.shouldDehydrateMutation()).toBe(false);
    expect(options.persister).toBeDefined();
  });

  it('adapte le magasin chiffré au contrat asynchrone du persistant', async () => {
    const store = memoryStore();
    const asyncStore = createAsyncStore(store);

    await asyncStore.setItem(QUERY_CACHE_STORAGE_KEY, '{"clientState":{}}');

    expect(store.values.get(QUERY_CACHE_STORAGE_KEY)).toBe('{"clientState":{}}');
    await expect(asyncStore.getItem(QUERY_CACHE_STORAGE_KEY)).resolves.toBe('{"clientState":{}}');
    await expect(asyncStore.getItem('absent')).resolves.toBeNull();
    await asyncStore.removeItem(QUERY_CACHE_STORAGE_KEY);
    await expect(asyncStore.getItem(QUERY_CACHE_STORAGE_KEY)).resolves.toBeNull();
  });

  it('signale une restauration réussie et lit un cache persisté (CL-4)', async () => {
    resetCacheRestored();
    expect(isCacheRestored()).toBe(false);
    expect(restoredQueryCount()).toBe(0);

    // A first launch restores zero query: the marker must not pretend a restore happened.
    markCacheRestored(0);
    expect(isCacheRestored()).toBe(false);
    expect(restoredQueryCount()).toBe(0);

    markCacheRestored(2);
    expect(isCacheRestored()).toBe(true);
    expect(restoredQueryCount()).toBe(2);

    const store = memoryStore();
    await store.setItem(QUERY_CACHE_STORAGE_KEY, JSON.stringify({ timestamp: 1, buster: 'x' }));
    const persisted = await readPersistedClient(createAsyncStore(store));
    expect(persisted).not.toBeNull();
    expect(persisted?.buster).toBe('x');

    await store.setItem(QUERY_CACHE_STORAGE_KEY, 'pas du json');
    await expect(readPersistedClient(createAsyncStore(store))).resolves.toBeNull();
    resetCacheRestored();
  });
});
