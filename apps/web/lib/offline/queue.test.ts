import 'fake-indexeddb/auto';

import { beforeEach, describe, expect, it } from 'vitest';

import { purgeOfflineDatabase } from './db';
import { enqueue, pendingCount, pendingEntries } from './queue';

beforeEach(async () => {
  await purgeOfflineDatabase();
});

const base = {
  kind: 'answer' as const,
  ownerId: '11111111-1111-4111-8111-111111111111',
  formationId: '22222222-2222-4222-8222-222222222222',
  sessionId: '33333333-3333-4333-8333-333333333333',
  position: 0,
  response: { selfRating: 'good' },
};

describe('[SPEC-801] file d’attente hors ligne', () => {
  it('attribue un clientId UUID unique et compte les entrées en attente (EF-7, EF-9)', async () => {
    const first = await enqueue(base, () => new Date('2026-11-11T12:00:00Z'));
    const second = await enqueue({ ...base, position: 1 }, () => new Date('2026-11-11T12:01:00Z'));
    expect(first.clientId).toMatch(/^[0-9a-f-]{36}$/u);
    expect(second.clientId).not.toBe(first.clientId);
    expect(first.status).toBe('pending');
    expect(await pendingCount()).toBe(2);
  });

  it('rend les entrées par answeredAt croissant (EF-8)', async () => {
    await enqueue(
      { ...base, position: 2, answeredAt: '2026-11-11T12:05:00.000Z' },
      () => new Date('2026-11-11T12:00:00Z'),
    );
    await enqueue(
      { ...base, position: 1, answeredAt: '2026-11-11T12:01:00.000Z' },
      () => new Date('2026-11-11T12:00:00Z'),
    );
    const entries = await pendingEntries();
    expect(entries.map((entry) => entry.position)).toEqual([1, 2]);
  });
});
