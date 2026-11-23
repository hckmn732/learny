// Offline pack of the day (SPEC-3305 EF-7, ET-4; SPEC-801 ET-5, ADR-0037).
//
// `GET /offline/pack` carries the session of the day, its public payloads and up to twenty extra
// recall cards. It is fetched at the first foreground of the day and stored in the encrypted store
// next to the cache; a pack of another civil day is never played (CL-2).
import type { OfflinePack, OfflinePackResponse } from '@learny/contracts';

import type { KeyValueStore } from '../auth/secure-storage';

/** Key of the pack inside the encrypted store (ET-4). */
export const OFFLINE_PACK_KEY = 'learny.offline-pack.v1';
/** Schema version of the pack: a bump drops an incompatible pack instead of crashing. */
export const OFFLINE_PACK_VERSION = 1;

export interface StoredPack {
  readonly version: number;
  /** Civil day of the pack, as the server sent it (`localDate`). */
  readonly day: string;
  /** Instant of the download, read from the application clock (ET-2). */
  readonly savedAt: string;
  readonly pack: OfflinePackResponse;
}

/** Wraps a server answer for storage (EF-7). */
export function storedPack(pack: OfflinePackResponse, savedAt: string): StoredPack {
  return { version: OFFLINE_PACK_VERSION, day: pack.localDate, savedAt, pack };
}

/** Parses a stored pack; anything unreadable or from another schema yields `null`. */
export function parsePack(raw: string | null): StoredPack | null {
  if (raw === null || raw.trim() === '') return null;
  try {
    const value = JSON.parse(raw) as Partial<StoredPack>;
    if (value.version !== OFFLINE_PACK_VERSION) return null;
    if (typeof value.day !== 'string' || typeof value.savedAt !== 'string') return null;
    const pack = (value as { pack?: unknown }).pack;
    if (pack === null || typeof pack !== 'object') return null;
    const formations = (pack as { formations?: unknown }).formations;
    if (!Array.isArray(formations)) return null;
    return {
      version: OFFLINE_PACK_VERSION,
      day: value.day,
      savedAt: value.savedAt,
      pack: pack as OfflinePackResponse,
    };
  } catch {
    return null;
  }
}

/** Pack of the store, or `null` when the device never downloaded one. */
export async function readPack(storage: KeyValueStore): Promise<StoredPack | null> {
  return parsePack(await storage.getItem(OFFLINE_PACK_KEY));
}

/** Stores the pack of the day (EF-7, ET-4). */
export async function writePack(storage: KeyValueStore, pack: StoredPack): Promise<void> {
  await storage.setItem(OFFLINE_PACK_KEY, JSON.stringify(pack));
}

/** Removes the pack (sign-out, EF-6). */
export async function clearPack(storage: KeyValueStore): Promise<void> {
  await storage.removeItem(OFFLINE_PACK_KEY);
}

/**
 * True when the pack may be played on `day` at `now` (CL-2): same civil day as the server, and not
 * expired yet. A pack of the previous day is refused with the message of `mobile.reviser.offline`.
 */
export function isPackPlayable(
  pack: StoredPack | null,
  day: string,
  now: Date,
): pack is StoredPack {
  if (pack === null) return false;
  if (pack.day !== day) return false;
  const expiresAt = Date.parse(pack.pack.expiresAt);
  return Number.isFinite(expiresAt) ? now.getTime() < expiresAt : false;
}

/** Session of a formation inside a playable pack (EF-7), or `null`. */
export function packSessionOf(pack: StoredPack, formationId: string): OfflinePack | null {
  return pack.pack.formations.find((formation) => formation.formationId === formationId) ?? null;
}
