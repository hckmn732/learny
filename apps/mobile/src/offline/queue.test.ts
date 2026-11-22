// Vitest [SPEC-3003] — offline queue (EF-6, ET-3; filled by SPEC-3305).
import { describe, expect, it } from 'vitest';

import type { KeyValueStore } from '../auth/secure-storage';

import {
  clearQueue,
  emptyQueue,
  enqueue,
  OFFLINE_QUEUE_KEY,
  OFFLINE_QUEUE_VERSION,
  parseQueue,
  readQueue,
  writeQueue,
} from './queue';

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

describe('[SPEC-3003] file hors ligne (EF-6)', () => {
  it('est créée vide et versionnée', async () => {
    const store = memoryStore();

    await expect(readQueue(store)).resolves.toEqual({
      version: OFFLINE_QUEUE_VERSION,
      items: [],
    });
    expect(emptyQueue().items).toHaveLength(0);
  });

  it('ignore une file illisible ou d’un autre schéma au lieu de planter', () => {
    expect(parseQueue('pas du json')).toEqual(emptyQueue());
    expect(parseQueue(JSON.stringify({ version: 99, items: [] }))).toEqual(emptyQueue());
    expect(parseQueue(JSON.stringify({ version: OFFLINE_QUEUE_VERSION, items: 'x' }))).toEqual(
      emptyQueue(),
    );
    expect(parseQueue(null)).toEqual(emptyQueue());
  });

  it('conserve la clé d’idempotence d’une intention persistée (ET-3)', async () => {
    const store = memoryStore();

    await enqueue(store, {
      id: 'answer:1',
      kind: 'answer',
      idempotencyKey: 'cle-1',
      createdAt: '2026-11-11T12:20:00.000Z',
      payload: { attemptId: 'a1' },
    });
    await enqueue(store, {
      id: 'answer:2',
      kind: 'answer',
      idempotencyKey: 'cle-2',
      createdAt: '2026-11-11T12:21:00.000Z',
      payload: { attemptId: 'a2' },
    });

    const queue = await readQueue(store);
    expect(queue.items.map((item) => item.idempotencyKey)).toEqual(['cle-1', 'cle-2']);
  });

  it('est purgée à la déconnexion (EF-6)', async () => {
    const store = memoryStore();
    await writeQueue(store, emptyQueue());
    await enqueue(store, {
      id: 'note:1',
      kind: 'note',
      idempotencyKey: 'cle-9',
      createdAt: '2026-11-11T12:20:00.000Z',
      payload: null,
    });

    await clearQueue(store);

    expect(store.values.has(OFFLINE_QUEUE_KEY)).toBe(false);
    await expect(readQueue(store)).resolves.toEqual(emptyQueue());
  });
});
