import { describe, expect, it } from 'vitest';

import type { OfflineEntry } from '@learny/contracts';

import { clampAnsweredAt, isExpired, orderEntries } from './sync';

function entry(clientId: string, answeredAt: string): OfflineEntry {
  return {
    clientId,
    kind: 'complete',
    formationId: '22222222-2222-4222-8222-222222222222',
    sessionId: '33333333-3333-4333-8333-333333333333',
    answeredAt,
  };
}

describe('[SPEC-801] synchronisation serveur', () => {
  it('trie les entrées par answeredAt croissant (ET-7)', () => {
    const ordered = orderEntries([
      entry('11111111-1111-4111-8111-111111111111', '2026-11-11T12:03:00.000Z'),
      entry('22222222-2222-4222-8222-222222222222', '2026-11-11T12:01:00.000Z'),
      entry('33333333-3333-4333-8333-333333333333', '2026-11-11T12:02:00.000Z'),
    ]);
    expect(ordered.map((value) => value.answeredAt)).toEqual([
      '2026-11-11T12:01:00.000Z',
      '2026-11-11T12:02:00.000Z',
      '2026-11-11T12:03:00.000Z',
    ]);
  });

  it('ramène une réponse future à l’instant serveur (ET-7)', () => {
    const now = new Date('2026-11-11T12:20:00Z');
    expect(clampAnsweredAt('2026-11-12T08:00:00.000Z', now)).toBe('2026-11-11T12:20:00.000Z');
    expect(clampAnsweredAt('2026-11-11T12:01:00.000Z', now)).toBe('2026-11-11T12:01:00.000Z');
  });

  it('rejette une réponse de plus de sept jours ou antérieure au jour local (ET-7)', () => {
    const now = new Date('2026-11-11T12:20:00Z');
    expect(isExpired('2026-11-11T08:00:00.000Z', '2026-11-11', 'Europe/Paris', now)).toBe(false);
    expect(isExpired('2026-11-03T12:00:00.000Z', '2026-11-11', 'Europe/Paris', now)).toBe(true);
    // 23:30 UTC on the 10th is 00:30 local on the 11th: inside the local day.
    expect(isExpired('2026-11-10T23:30:00.000Z', '2026-11-11', 'Europe/Paris', now)).toBe(false);
    expect(isExpired('2026-11-09T22:30:00.000Z', '2026-11-11', 'Europe/Paris', now)).toBe(true);
  });
});
