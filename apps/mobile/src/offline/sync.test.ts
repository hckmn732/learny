// Vitest [SPEC-3305] — synchronisation de la file hors ligne (EF-8, ET-6, CL-1, CL-3).
import { describe, expect, it } from 'vitest';

import type { OfflineSyncInput, OfflineSyncResponse } from '@learny/contracts';

import type { KeyValueStore } from '../auth/secure-storage';

import { queuedEntry, readQueue, writeQueue, type OfflineQueue } from './queue';
import { SYNC_BATCH_SIZE, syncOfflineQueue } from './sync';

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

const formationId = '00000000-0000-4000-8000-000000000002';
const sessionId = '00000000-0000-4000-8000-000000000003';

function entry(index: number, minute = index) {
  return queuedEntry({
    clientId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    formationId,
    sessionId,
    answeredAt: new Date(Date.UTC(2026, 10, 11, 12, minute)).toISOString(),
    kind: 'answer',
    position: index,
    response: { selfGrade: 'good' },
    timeMs: 1000,
  });
}

async function queueOf(count: number): Promise<{ store: KeyValueStore; queue: OfflineQueue }> {
  const store = memoryStore();
  const queue: OfflineQueue = {
    version: 1,
    items: Array.from({ length: count }, (_, i) => entry(i)),
  };
  await writeQueue(store, queue);
  return { store, queue };
}

describe('[SPEC-3305] synchronisation des réponses hors ligne (EF-8)', () => {
  it('envoie les réponses dans l’ordre de answeredAt (ET-6)', async () => {
    const store = memoryStore();
    await writeQueue(store, {
      version: 1,
      items: [entry(2, 2), entry(1, 1), entry(0, 0)],
    });
    const sent: OfflineSyncInput[] = [];
    const report = await syncOfflineQueue({
      storage: store,
      send: (input) => {
        sent.push(input);
        return Promise.resolve({
          results: input.entries.map((item) => ({ clientId: item.clientId, status: 'applied' })),
        });
      },
    });

    expect(sent[0]?.entries.map((item) => item.answeredAt)).toEqual([
      '2026-11-11T12:00:00.000Z',
      '2026-11-11T12:01:00.000Z',
      '2026-11-11T12:02:00.000Z',
    ]);
    expect(report).toMatchObject({ sent: 3, applied: 3, remaining: 0, failed: false });
  });

  it('envoie par lots de 50 au plus (ET-6)', async () => {
    const { store } = await queueOf(120);
    const sizes: number[] = [];
    const report = await syncOfflineQueue({
      storage: store,
      send: (input) => {
        sizes.push(input.entries.length);
        return Promise.resolve({
          results: input.entries.map((item) => ({ clientId: item.clientId, status: 'applied' })),
        });
      },
    });

    expect(sizes).toEqual([SYNC_BATCH_SIZE, SYNC_BATCH_SIZE, 20]);
    expect(report.sent).toBe(120);
    await expect(readQueue(store)).resolves.toEqual({ version: 1, items: [] });
  });

  it('marque les réponses refusées et n’oublie pas les autres (EF-8)', async () => {
    const { store } = await queueOf(3);
    const report = await syncOfflineQueue({
      storage: store,
      send: (input): Promise<OfflineSyncResponse> =>
        Promise.resolve({
          results: input.entries.map((item, index) => ({
            clientId: item.clientId,
            status: index === 0 ? ('rejected' as const) : ('applied' as const),
            ...(index === 0 ? { code: 'EXPIRED' as const } : {}),
          })),
        }),
    });

    const queue = await readQueue(store);
    expect(report.rejected).toBe(1);
    expect(report.remaining).toBe(0);
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]?.status).toBe('rejected');
  });

  it('traite un doublon comme appliqué, sans doublon en file (CL-1)', async () => {
    const { store } = await queueOf(2);
    await syncOfflineQueue({
      storage: store,
      send: (input) =>
        Promise.resolve({
          results: input.entries.map((item) => ({ clientId: item.clientId, status: 'duplicate' })),
        }),
    });

    await expect(readQueue(store)).resolves.toEqual({ version: 1, items: [] });
  });

  it('remet les entrées en attente quand le réseau tombe (CL-1)', async () => {
    const { store } = await queueOf(2);
    const report = await syncOfflineQueue({
      storage: store,
      send: () => Promise.reject(new Error('réseau coupé')),
    });

    expect(report).toMatchObject({ failed: true, remaining: 2, rejected: 0 });
    const queue = await readQueue(store);
    expect(queue.items.every((item) => item.status !== 'syncing')).toBe(true);
  });

  it('ne lance jamais deux envois en parallèle (ET-1)', async () => {
    const { store } = await queueOf(2);
    let calls = 0;
    const control: { release: () => void } = { release: () => undefined };
    const gate = new Promise<void>((resolve) => {
      control.release = resolve;
    });
    const send = async (input: OfflineSyncInput): Promise<OfflineSyncResponse> => {
      calls += 1;
      await gate;
      return {
        results: input.entries.map((item) => ({ clientId: item.clientId, status: 'applied' })),
      };
    };

    const first = syncOfflineQueue({ storage: store, send });
    const second = syncOfflineQueue({ storage: store, send });
    expect(second).toBe(first);
    control.release();
    await Promise.all([first, second]);

    expect(calls).toBe(1);
  });
});
