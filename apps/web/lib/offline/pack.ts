// Client side of the daily offline pack (SPEC-801 ET-9, EF-4, CL-4, CL-5, CL-7). The shell calls
// `prefetchPack` when online; the pack is replaced, never merged, and a different `ownerId` wipes
// the database before writing. A quota error or an unavailable storage abandons the prefetch
// silently: the online application keeps working.
import { OfflinePackResponseSchema, type OfflinePackResponse } from '@learny/contracts';
import { systemClock, type Clock } from '@learny/core';

import {
  deletePack,
  listPacks,
  purgeOfflineDatabase,
  purgeRuntimeCaches,
  readMeta,
  replacePacks,
  writeMeta,
  type StoredPack,
} from './db';

export interface PrefetchOptions {
  fetchImpl?: typeof fetch;
  now?: () => Date;
  clock?: Clock;
}

export interface PrefetchResult {
  stored: boolean;
  localDate?: string;
  reason?: 'offline' | 'unauthorised' | 'quota' | 'error';
}

function isQuotaError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED')
  );
}

function logWarn(message: string): void {
  if (process.env.NODE_ENV !== 'production') console.warn(`[offline] ${message}`);
}

/** Reads the stored packs, dropping the ones past `expiresAt` (CL-4). */
export async function availablePacks(now: Date): Promise<StoredPack[]> {
  const packs = await listPacks();
  const kept: StoredPack[] = [];
  for (const pack of packs) {
    const expiry = new Date(pack.expiresAt).getTime();
    if (Number.isNaN(expiry) || expiry <= now.getTime()) {
      await deletePack(pack.formationId);
      continue;
    }
    kept.push(pack);
  }
  return kept.sort((a, b) => a.formationTitle.localeCompare(b.formationTitle));
}

async function ownerAllows(ownerId: string): Promise<boolean> {
  const current = await readMeta('owner');
  if (current?.ownerId === ownerId) return true;
  if (current?.ownerId === undefined) {
    await writeMeta({ key: 'owner', ownerId });
    return true;
  }
  // CL-5: another learner used this browser: never mix their answers with this session.
  await purgeOfflineDatabase();
  await purgeRuntimeCaches();
  await writeMeta({ key: 'owner', ownerId });
  return false;
}

/**
 * EF-4 — fetches the pack of the day and stores it. The session of the shell calls it after
 * `requestIdleCallback`; a pack already stored for the same local day is not fetched again.
 */
export async function prefetchPack(options: PrefetchOptions = {}): Promise<PrefetchResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => (options.clock ?? systemClock).now());
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.onLine === 'boolean' &&
    !navigator.onLine
  ) {
    return { stored: false, reason: 'offline' };
  }
  try {
    const response = await fetchImpl('/api/v1/offline/pack', {
      headers: { accept: 'application/json' },
      credentials: 'same-origin',
    });
    if (response.status === 401) return { stored: false, reason: 'unauthorised' };
    if (!response.ok) return { stored: false, reason: 'error' };
    const raw: unknown = await response.json();
    const parsed = OfflinePackResponseSchema.safeParse(raw);
    if (!parsed.success) return { stored: false, reason: 'error' };
    const pack: OfflinePackResponse = parsed.data;
    const last = await readMeta('lastPack');
    const sameDay = last?.localDate === pack.localDate;
    await ownerAllows(pack.ownerId);
    if (sameDay) {
      const existing = await listPacks();
      if (existing.length === pack.formations.length) {
        return { stored: false, localDate: pack.localDate };
      }
    }
    const fetchedAt = now().toISOString();
    await replacePacks(
      pack.formations.map((formation) => ({
        formationId: formation.formationId,
        formationTitle: formation.formationTitle,
        session: formation.session,
        extraCards: formation.extraCards,
        ownerId: pack.ownerId,
        localDate: pack.localDate,
        fetchedAt,
        expiresAt: pack.expiresAt,
        storedAt: fetchedAt,
      })),
    );
    await writeMeta({
      key: 'lastPack',
      ownerId: pack.ownerId,
      localDate: pack.localDate,
      fetchedAt,
      expiresAt: pack.expiresAt,
    });
    return { stored: true, localDate: pack.localDate };
  } catch (error) {
    if (isQuotaError(error)) {
      logWarn('préchargement abandonné : quota de stockage dépassé (CL-7)');
      return { stored: false, reason: 'quota' };
    }
    // Storage refused (private navigation) or network failure: the online app keeps working.
    logWarn(`préchargement abandonné : ${error instanceof Error ? error.message : String(error)}`);
    return { stored: false, reason: 'error' };
  }
}
