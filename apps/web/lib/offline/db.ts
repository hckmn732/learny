// IndexedDB schema of the offline mode (SPEC-801 ET-4, ADR-0200). One database per origin,
// `learny-offline` version 1: `meta` holds the owner and the last pack day, `packs` one offline
// pack per formation, `progress` the local position of a session and `queue` the answers waiting
// for the network. Nothing here is authenticated data cached by the service worker: the store is
// removed on sign-out (EF-11) and replaced when another learner signs in (CL-5).
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

import type { GlobalQuizSessionDto, OfflineExtraCard, OfflineQueueStatus } from '@learny/contracts';

export const OFFLINE_DB_NAME = 'learny-offline';
export const OFFLINE_DB_VERSION = 1;

export interface OfflineMeta {
  key: 'owner' | 'lastPack';
  ownerId?: string;
  localDate?: string;
  fetchedAt?: string;
  expiresAt?: string;
}

export interface StoredPack {
  formationId: string;
  formationTitle: string;
  session: GlobalQuizSessionDto;
  extraCards: OfflineExtraCard[];
  ownerId: string;
  localDate: string;
  fetchedAt: string;
  expiresAt: string;
  storedAt: string;
}

export interface OfflineProgress {
  sessionId: string;
  formationId: string;
  position: number;
  answered: number[];
  skipped: number[];
  completed: boolean;
}

export interface QueueEntry {
  clientId: string;
  kind: 'answer' | 'complete';
  ownerId: string;
  formationId: string;
  sessionId: string;
  position?: number;
  brickVersionId?: string;
  skipped?: true;
  response?: unknown;
  timeMs?: number;
  selfGrade?: 'again' | 'hard' | 'good' | 'easy';
  answeredAt: string;
  status: OfflineQueueStatus;
  attempts: number;
  lastError?: string;
}

interface OfflineDb extends DBSchema {
  meta: { key: string; value: OfflineMeta };
  packs: { key: string; value: StoredPack };
  progress: { key: string; value: OfflineProgress };
  queue: {
    key: string;
    value: QueueEntry;
    indexes: { 'by-status': string; 'by-answeredAt': string };
  };
}

let dbPromise: Promise<IDBPDatabase<OfflineDb>> | null = null;

export function offlineDb(): Promise<IDBPDatabase<OfflineDb>> {
  dbPromise ??= openDB<OfflineDb>(OFFLINE_DB_NAME, OFFLINE_DB_VERSION, {
    upgrade(db) {
      db.createObjectStore('meta', { keyPath: 'key' });
      db.createObjectStore('packs', { keyPath: 'formationId' });
      db.createObjectStore('progress', { keyPath: 'sessionId' });
      const queue = db.createObjectStore('queue', { keyPath: 'clientId' });
      queue.createIndex('by-status', 'status');
      queue.createIndex('by-answeredAt', 'answeredAt');
    },
  });
  return dbPromise;
}

/** Tests and the sign-out purge reset the cached connection. */
export function resetOfflineDbConnection(): void {
  dbPromise = null;
}

export async function readMeta(key: 'owner' | 'lastPack'): Promise<OfflineMeta | undefined> {
  return (await offlineDb()).get('meta', key);
}

export async function writeMeta(value: OfflineMeta): Promise<void> {
  await (await offlineDb()).put('meta', value);
}

export async function listPacks(): Promise<StoredPack[]> {
  return (await offlineDb()).getAll('packs');
}

export async function getPack(formationId: string): Promise<StoredPack | undefined> {
  return (await offlineDb()).get('packs', formationId);
}

export async function replacePacks(packs: readonly StoredPack[]): Promise<void> {
  const db = await offlineDb();
  const tx = db.transaction('packs', 'readwrite');
  await tx.store.clear();
  for (const pack of packs) await tx.store.put(pack);
  await tx.done;
}

export async function deletePack(formationId: string): Promise<void> {
  await (await offlineDb()).delete('packs', formationId);
}

export async function readProgress(sessionId: string): Promise<OfflineProgress | undefined> {
  return (await offlineDb()).get('progress', sessionId);
}

export async function writeProgress(progress: OfflineProgress): Promise<void> {
  await (await offlineDb()).put('progress', progress);
}

export async function queueEntries(): Promise<QueueEntry[]> {
  const db = await offlineDb();
  const entries = await db.getAllFromIndex('queue', 'by-answeredAt');
  return entries;
}

export async function pendingEntries(): Promise<QueueEntry[]> {
  const db = await offlineDb();
  const entries = await db.getAllFromIndex('queue', 'by-status', 'pending');
  return entries.sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
}

export async function pendingCount(): Promise<number> {
  return (await offlineDb()).countFromIndex('queue', 'by-status', 'pending');
}

export async function putQueueEntry(entry: QueueEntry): Promise<void> {
  await (await offlineDb()).put('queue', entry);
}

export async function deleteQueueEntry(clientId: string): Promise<void> {
  await (await offlineDb()).delete('queue', clientId);
}

/** EF-11 — removes the whole database (owner change, sign-out, tests). */
export async function purgeOfflineDatabase(): Promise<void> {
  if (dbPromise !== null) {
    const current = await dbPromise.catch(() => null);
    current?.close();
  }
  dbPromise = null;
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(OFFLINE_DB_NAME);
    request.onsuccess = () => {
      resolve();
    };
    request.onerror = () => {
      reject(request.error ?? new Error('Suppression IndexedDB impossible.'));
    };
    request.onblocked = () => {
      resolve();
    };
  });
}

/** EF-11 — removes the runtime caches but keeps the static precache (a shared device). */
export async function purgeRuntimeCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  const keys = await caches.keys();
  await Promise.all(
    keys.filter((key) => !/serwist-precache/i.test(key)).map((key) => caches.delete(key)),
  );
}
