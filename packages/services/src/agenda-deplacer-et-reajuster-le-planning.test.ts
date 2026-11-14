// Contract-level unit tests of the move and replan services (SPEC-705 §9). The detailed paths
// live in `spec-705.test.ts`; these two checks pin the public helpers the routes rely on.
import { describe, expect, it } from 'vitest';

import {
  normalizeOptions,
  planVersionOf,
  slotVersionOf,
} from './agenda-deplacer-et-reajuster-le-planning';

const FORMATION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const MODULE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const SLOT = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

describe('[SPEC-705] service et calculs', () => {
  it('CL-2 — deux lectures du même créneau donnent la même version', () => {
    const row = {
      id: SLOT,
      starts_at: '2026-11-11T14:00:00Z',
      ends_at: '2026-11-11T15:00:00Z',
      status: 'planned',
    };
    expect(slotVersionOf(row)).toBe(slotVersionOf({ ...row }));
    expect(slotVersionOf(row)).toMatch(/^slot-[0-9a-f]{16}$/);
  });

  it('EF-2 — le plan et les trois options restent déterministes', () => {
    const parts = {
      formation: { id: FORMATION, end_date: '2026-11-30', volume_hours: 20 },
      modules: [{ module_id: MODULE, status: 'open' as const, planned_end: '2026-11-13' }],
      slots: [
        {
          id: SLOT,
          starts_at: '2026-11-11T14:00:00Z',
          ends_at: '2026-11-11T15:00:00Z',
          status: 'planned',
        },
      ],
      hoursPerDay: 5,
      studyDays: [1, 2, 3, 4, 5],
    };
    expect(planVersionOf(parts)).toBe(planVersionOf({ ...parts }));
    expect(
      normalizeOptions([
        {
          kind: 'shift_end',
          feasible: true,
          reason: null,
          currentEndDate: '2026-11-30',
          projectedEndDate: '2026-12-02',
          extraDays: 2,
          currentHoursPerDay: 5,
          newHoursPerDay: null,
          removedMinutes: null,
        },
      ]).map((option) => option.kind),
    ).toEqual(['shift_end', 'increase_volume', 'lighten']);
  });
});
