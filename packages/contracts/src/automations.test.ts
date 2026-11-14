import { describe, expect, it } from 'vitest';

import {
  REPRISE_ACTION_KINDS,
  RepriseChoice,
  RepriseParams,
  ReprisePlanOption,
} from './automations';

describe('[SPEC-712] schémas de l’automatisme reprise', () => {
  it('EF-1 — les valeurs par défaut respectent BR-AUT-01', () => {
    const parsed = RepriseParams.parse({});
    expect(parsed).toEqual({ inactiveDays: 2, lightenDays: 5, mode: 'accord' });
  });

  it('EF-1 — seules les valeurs des listes fermées sont acceptées', () => {
    for (const inactiveDays of [1, 2, 3] as const) {
      for (const lightenDays of [4, 5, 7] as const) {
        const result = RepriseParams.safeParse({ inactiveDays, lightenDays, mode: 'auto' });
        expect(result.success).toBe(lightenDays > inactiveDays);
      }
    }
    expect(RepriseParams.safeParse({ inactiveDays: 4 }).success).toBe(false);
    expect(RepriseParams.safeParse({ lightenDays: 6 }).success).toBe(false);
    expect(RepriseParams.safeParse({ mode: 'always' }).success).toBe(false);
  });

  it('ET-1 — le choix est soit un créneau, soit une option de planning', () => {
    expect(RepriseChoice.safeParse({ startsAt: '2026-11-12T10:30:00+01:00' }).success).toBe(true);
    expect(RepriseChoice.safeParse({ option: 'shift_end' }).success).toBe(true);
    expect(RepriseChoice.safeParse({ option: 'lighten' }).success).toBe(true);
    expect(RepriseChoice.safeParse({ option: 'increase_volume' }).success).toBe(false);
    expect(RepriseChoice.safeParse({ startsAt: 'jeudi' }).success).toBe(false);
  });

  it('EF-6 — les options exposées au dialogue restent dans le périmètre de BR-FOR-14', () => {
    const option = {
      kind: 'lighten',
      feasible: true,
      reason: null,
      currentEndDate: '2026-12-11',
      projectedEndDate: '2026-12-11',
      extraDays: null,
      currentHoursPerDay: 2,
      newHoursPerDay: 2,
      removedMinutes: 60,
    } as const;
    expect(ReprisePlanOption.safeParse(option).success).toBe(true);
    expect(ReprisePlanOption.safeParse({ ...option, kind: 'increase_volume' }).success).toBe(false);
  });

  it('ET-1 — les quatre types d’action sont uniques et snake_case', () => {
    expect(new Set(REPRISE_ACTION_KINDS).size).toBe(4);
    for (const kind of REPRISE_ACTION_KINDS) expect(kind).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});
