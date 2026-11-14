import { describe, expect, it } from 'vitest';

import { detectMissedSlots, isNeverRescheduled, type RepriseSlot } from './detect-missed';

const TZ = 'Europe/Paris';

function slot(overrides: Partial<RepriseSlot> = {}): RepriseSlot {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    formationId: '22222222-2222-4222-8222-222222222222',
    moduleId: null,
    activityId: null,
    kind: 'course',
    title: 'Ledgers parallèles',
    startsAt: '2026-11-10T10:30:00+01:00',
    endsAt: '2026-11-10T12:00:00+01:00',
    status: 'planned',
    ...overrides,
  };
}

describe('[SPEC-712] reprise · séance manquée', () => {
  it('EF-2 — un créneau terminé à 21:59 n’est manqué qu’au tick de 22:01', () => {
    const finished = slot({
      startsAt: '2026-11-10T21:00:00+01:00',
      endsAt: '2026-11-10T21:59:00+01:00',
    });
    expect(detectMissedSlots([finished], '2026-11-10T21:58:00+01:00', TZ)).toHaveLength(0);
    const missed = detectMissedSlots([finished], '2026-11-10T22:01:00+01:00', TZ);
    expect(missed).toHaveLength(1);
    expect(missed[0]?.missedDate).toBe('2026-11-10');
    expect(missed[0]?.durationMinutes).toBe(59);
  });

  it('ADR-0192 §1 — les types jamais replacés sont exclus', () => {
    for (const kind of [
      'global_quiz',
      'warmup',
      'micro_session',
      'weekly_review',
      'buffer',
      'inconnu',
    ]) {
      expect(isNeverRescheduled(kind)).toBe(true);
      expect(detectMissedSlots([slot({ kind })], '2026-11-11T22:00:00+01:00', TZ)).toHaveLength(0);
    }
    for (const kind of [
      'contributions',
      'course',
      'exercise',
      'validation_quiz',
      'revision',
      'sprint',
      'mock_exam',
    ]) {
      expect(isNeverRescheduled(kind)).toBe(false);
    }
  });

  it('EF-2 — seuls les créneaux prévus d’une formation active sont retenus', () => {
    const at = '2026-11-11T22:00:00+01:00';
    expect(detectMissedSlots([slot({ status: 'done' })], at, TZ)).toHaveLength(0);
    expect(detectMissedSlots([slot({ status: 'moved' })], at, TZ)).toHaveLength(0);
    expect(detectMissedSlots([slot()], at, TZ, { formationStatus: () => 'paused' })).toHaveLength(
      0,
    );
    expect(detectMissedSlots([slot()], at, TZ, { formationStatus: () => 'active' })).toHaveLength(
      1,
    );
  });

  it('EF-2 — l’ordre est déterministe, du plus ancien au plus récent', () => {
    const missed = detectMissedSlots(
      [
        slot({
          id: 'b',
          startsAt: '2026-11-11T09:00:00+01:00',
          endsAt: '2026-11-11T10:00:00+01:00',
        }),
        slot({
          id: 'a',
          startsAt: '2026-11-10T09:00:00+01:00',
          endsAt: '2026-11-10T10:00:00+01:00',
        }),
      ],
      '2026-11-11T22:00:00+01:00',
      TZ,
    );
    expect(missed.map((entry) => entry.id)).toEqual(['a', 'b']);
  });
});
