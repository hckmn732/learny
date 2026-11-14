import { describe, expect, it } from 'vitest';

import { countInactiveStudyDays } from './inactivity';

const RHYTHM = [1, 2, 3, 4, 5];

function count(input: Partial<Parameters<typeof countInactiveStudyDays>[0]> = {}) {
  return countInactiveStudyDays({
    dailyActivity: [],
    studyDays: RHYTHM,
    pauses: [],
    accountCreatedOn: '2026-09-01',
    today: '2026-11-11',
    ...input,
  });
}

describe('[SPEC-712] reprise · jours sans activité', () => {
  it('ADR-0192 §2 — les jours d’étude consécutifs sans activité sont comptés', () => {
    expect(
      count({
        today: '2026-11-11',
        dailyActivity: [{ day: '2026-11-06', qualifying: true }],
      }).days,
    ).toBe(2); // lundi 9, mardi 10
    expect(
      count({
        today: '2026-11-12',
        dailyActivity: [{ day: '2026-11-06', qualifying: true }],
      }).days,
    ).toBe(3); // 9, 10 et 11
    expect(
      count({
        today: '2026-11-12',
        dailyActivity: [{ day: '2026-11-10', qualifying: true }],
      }).days,
    ).toBe(1); // mercredi 11 seulement
  });

  it('ADR-0033 — le week-end et les jours hors rythme sont neutres', () => {
    expect(
      count({
        today: '2026-11-09',
        dailyActivity: [{ day: '2026-11-05', qualifying: true }],
      }).days,
    ).toBe(1); // vendredi 6 seulement, le week-end ne compte pas
    expect(
      count({
        today: '2026-11-09',
        studyDays: [1, 3, 5],
        dailyActivity: [{ day: '2026-11-05', qualifying: true }],
      }).days,
    ).toBe(1); // seul vendredi 6 est un jour prévu
  });

  it('CL-4 — les jours de pause sont neutres et l’épisode repart de la fin de pause', () => {
    const result = count({
      today: '2026-11-11',
      pauses: [{ startsOn: '2026-11-09', endsOn: '2026-11-10' }],
    });
    expect(result.days).toBe(0);
    expect(result.lastActivityOn).toBe('2026-11-10');
  });

  it('CL-12 — le décompte s’arrête au jour de création du compte', () => {
    expect(
      count({
        today: '2026-11-11',
        accountCreatedOn: '2026-11-10',
      }).days,
    ).toBe(1);
    expect(
      count({
        today: '2026-11-11',
        accountCreatedOn: '2026-11-11',
      }).days,
    ).toBe(0);
  });

  it('CL-9 — le changement d’heure ne modifie pas le décompte de jours civils', () => {
    expect(
      count({
        today: '2026-10-26',
        dailyActivity: [{ day: '2026-10-21', qualifying: true }],
      }).days,
    ).toBe(2); // jeudi 22 et vendredi 23, puis week-end neutre
  });

  it('ADR-0192 §2 — la dernière activité qualifiante identifie l’épisode', () => {
    const result = count({
      today: '2026-11-13',
      dailyActivity: [
        { day: '2026-11-09', qualifying: false },
        { day: '2026-11-10', qualifying: true },
        { day: '2026-11-12', qualifying: false },
      ],
    });
    expect(result.days).toBe(2);
    expect(result.lastActivityOn).toBe('2026-11-10');
  });
});
