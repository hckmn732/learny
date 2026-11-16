import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { purgeOfflineDatabase } from './db';
import { enqueue, pendingCount, queueEntries } from './queue';
import { syncQueue } from './sync';

const base = {
  kind: 'answer' as const,
  ownerId: '11111111-1111-4111-8111-111111111111',
  formationId: '22222222-2222-4222-8222-222222222222',
  sessionId: '33333333-3333-4333-8333-333333333333',
  response: { selfRating: 'good' },
};

function response(results: unknown[]): Response {
  return new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(async () => {
  await purgeOfflineDatabase();
});

describe('[SPEC-801] synchronisation de la file', () => {
  it('envoie des lots de 50 au plus et supprime les entrées appliquées (EF-8)', async () => {
    for (let index = 0; index < 51; index += 1) {
      await enqueue({ ...base, position: index });
    }
    const batches: number[] = [];
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { entries: { clientId: string }[] };
      batches.push(body.entries.length);
      return Promise.resolve(
        response(body.entries.map((entry) => ({ clientId: entry.clientId, status: 'applied' }))),
      );
    });
    const result = await syncQueue({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(batches).toEqual([50, 1]);
    expect(result.synced).toBe(51);
    expect(await pendingCount()).toBe(0);
  });

  it('remet les entrées en attente quand le réseau échoue (EF-8)', async () => {
    await enqueue({ ...base, position: 0 });
    const fetchImpl = vi.fn(() => Promise.reject(new TypeError('réseau coupé')));
    const result = await syncQueue({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.synced).toBe(0);
    expect(await pendingCount()).toBe(1);
    const [entry] = await queueEntries();
    expect(entry?.status).toBe('pending');
    expect(entry?.attempts).toBe(1);
  });

  it('conserve une entrée refusée avec son code pendant sept jours (EF-8, CL-4)', async () => {
    await enqueue({ ...base, position: 0 });
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => {
      const body = JSON.parse(init?.body as string) as { entries: { clientId: string }[] };
      return response(
        body.entries.map((entry) => ({
          clientId: entry.clientId,
          status: 'rejected',
          code: 'EXPIRED',
        })),
      );
    });
    const result = await syncQueue({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(result.rejected).toBe(1);
    expect(await pendingCount()).toBe(0);
    const [entry] = await queueEntries();
    expect(entry?.status).toBe('rejected');
    expect(entry?.lastError).toBe('EXPIRED');
  });

  it('empêche deux synchronisations concurrentes (ET-9)', async () => {
    await enqueue({ ...base, position: 0 });
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      await gate;
      const body = JSON.parse(init?.body as string) as { entries: { clientId: string }[] };
      return response(
        body.entries.map((entry) => ({ clientId: entry.clientId, status: 'applied' })),
      );
    });
    const first = syncQueue({ fetchImpl: fetchImpl as unknown as typeof fetch });
    const second = await syncQueue({ fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(second.ran).toBe(false);
    release?.();
    expect((await first).synced).toBe(1);
  });
});
