// Boundary validation and existing-slot handling of the planner (SPEC-407 ET-5, BR-FOR-15).
import { describe, expect, it } from 'vitest';

import { ENGINE } from '@learny/config/product';

import { EngineError } from '../errors';
import { localDateOf } from '../time';
import type { Availability } from '../types';

import { assertPlannerParams, assertPreferences, maxChunkMinutes } from './grid';
import { planSchedule } from './plan';
import type {
  ExistingPlannerSlot,
  PlanScheduleInput,
  PlannerFormation,
  PlannerParams,
  PlannerPreferences,
} from './types';

const NOW = '2026-11-11T12:20:00.000Z';
const TZ = 'Europe/Paris';
const PARAMS: PlannerParams = ENGINE.planner;

const AVAILABILITY: Availability = {
  hoursPerDay: 4,
  studyDays: [1, 2, 3, 4, 5],
  preferredSlots: ['matin', 'apres_midi'],
};

const PREFERENCES: PlannerPreferences = { tz: TZ, availability: AVAILABILITY };

const FORMATION: PlannerFormation = {
  formationId: 'sap',
  endDate: '2026-11-25',
  modules: [
    {
      moduleId: 'sap-m1',
      position: 1,
      hours: 6,
      chapters: [{ chapterId: 'sap-m1-c1', position: 1 }],
    },
  ],
};

function input(overrides: Partial<PlanScheduleInput> = {}): PlanScheduleInput {
  return {
    formations: [FORMATION],
    preferences: PREFERENCES,
    params: PARAMS,
    now: NOW,
    ...overrides,
  };
}

function withModule(overrides: Partial<PlannerFormation['modules'][number]>): PlannerFormation[] {
  const module = FORMATION.modules[0];
  if (module === undefined) throw new Error('fixture');
  return [{ ...FORMATION, modules: [{ ...module, ...overrides }] }];
}

function failure(run: () => unknown): EngineError {
  try {
    run();
  } catch (error) {
    if (error instanceof EngineError) return error;
    throw error;
  }
  throw new Error('une EngineError était attendue');
}

describe('[SPEC-407] validation des entrées du planificateur (ET-5)', () => {
  it('refuse une date de fin, un volume, une position ou une échéance invalides', () => {
    expect(
      failure(() => planSchedule(input({ formations: [{ ...FORMATION, endDate: 'hier' }] })))
        .details,
    ).toMatchObject({ path: 'formations.endDate' });
    expect(
      failure(() => planSchedule(input({ formations: withModule({ hours: 0 }) }))).details,
    ).toMatchObject({ path: 'formations.modules.hours' });
    expect(
      failure(() => planSchedule(input({ formations: withModule({ position: 0 }) }))).details,
    ).toMatchObject({ path: 'formations.modules.position' });
    expect(
      failure(() => planSchedule(input({ formations: withModule({ deadline: '25/11' }) }))).details,
    ).toMatchObject({ path: 'formations.modules.deadline' });
    expect(
      failure(() =>
        planSchedule(
          input({ formations: withModule({ chapters: [{ chapterId: 'c', position: -1 }] }) }),
        ),
      ).details,
    ).toMatchObject({ path: 'formations.modules.chapters.position' });
  });

  it('refuse un créneau existant dont les instants sont invalides', () => {
    const broken: ExistingPlannerSlot = {
      slotId: 'slot-broken',
      formationId: 'sap',
      moduleId: 'sap-m1',
      kind: 'course',
      title: 'Cassé',
      startsAt: 'pas-un-instant',
      endsAt: '2026-11-12T09:00:00.000Z',
      status: 'planned',
    };
    expect(() => planSchedule(input({ existingSlots: [broken] }))).toThrow(EngineError);
  });

  it('valide les paramètres du moteur', () => {
    expect(
      failure(() => {
        assertPlannerParams({ ...PARAMS, bufferMinutes: 0 });
      }).details,
    ).toMatchObject({ path: 'params.bufferMinutes' });
    expect(
      failure(() => {
        assertPlannerParams({ ...PARAMS, contributionShare: 1.5 });
      }).details,
    ).toMatchObject({ path: 'params.contributionShare' });
    expect(
      failure(() => {
        assertPlannerParams({ ...PARAMS, sprintDaysBeforeDefault: 0 });
      }).details,
    ).toMatchObject({ path: 'params.sprintDaysBeforeDefault' });
    expect(
      failure(() => {
        assertPlannerParams({ ...PARAMS, sprintDaysBeforeDefault: 99 });
      }).details,
    ).toMatchObject({ path: 'params.sprintDaysBeforeDefault' });
    expect(
      failure(() => {
        assertPlannerParams({ ...PARAMS, mockExam: { ...PARAMS.mockExam, questions: 0 } });
      }).details,
    ).toMatchObject({ path: 'params.mockExam' });
    expect(
      failure(() => {
        assertPlannerParams({
          ...PARAMS,
          moments: { ...PARAMS.moments, soir: { start: '25:00', end: '26:00' } },
        });
      }).details,
    ).toMatchObject({ path: 'params.moments' });
    expect(
      failure(() => {
        assertPlannerParams({
          ...PARAMS,
          moments: { ...PARAMS.moments, soir: { start: '20:00', end: '19:00' } },
        });
      }).details,
    ).toMatchObject({ path: 'params.moments' });
    expect(() => {
      assertPlannerParams(PARAMS);
    }).not.toThrow();
  });

  it('valide le fuseau et les jours fériés des préférences', () => {
    expect(
      failure(() => {
        assertPreferences({ ...PREFERENCES, tz: 'Mars/Olympus' });
      }).details,
    ).toMatchObject({ path: 'preferences.tz' });
    expect(
      failure(() => {
        assertPreferences({ ...PREFERENCES, holidays: ['noel'] });
      }).details,
    ).toMatchObject({ path: 'preferences.holidays' });
    expect(() => {
      assertPreferences({ ...PREFERENCES, holidays: ['2026-12-25'] });
    }).not.toThrow();
  });

  it('le plus grand bloc vaut le plus long moment préféré, au moins la granularité', () => {
    expect(maxChunkMinutes(PARAMS, [])).toBe(PARAMS.granularityMinutes);
    expect(maxChunkMinutes(PARAMS, ['matin'])).toBeGreaterThanOrEqual(PARAMS.granularityMinutes);
  });
});

describe('[SPEC-407] créneaux existants annulés, déplacés et manuels', () => {
  const base: ExistingPlannerSlot = {
    slotId: 'slot-x',
    formationId: 'sap',
    moduleId: 'sap-m1',
    kind: 'course',
    title: 'Cours',
    startsAt: '2026-11-16T08:00:00.000Z',
    endsAt: '2026-11-16T09:00:00.000Z',
    status: 'planned',
    createdBy: 'planner',
  };

  it('conserve l’historique des créneaux annulés et déplacés sans les replanifier', () => {
    const cancelled = { ...base, slotId: 'slot-cancelled', status: 'cancelled' as const };
    const moved = { ...base, slotId: 'slot-moved', status: 'moved' as const };
    const result = planSchedule(input({ existingSlots: [cancelled, moved] }));
    expect(result.slots.find((slot) => slot.slotId === 'slot-cancelled')?.status).toBe('cancelled');
    expect(result.slots.find((slot) => slot.slotId === 'slot-moved')?.status).toBe('moved');
    expect(result.conflicts.filter((c) => c.slotIds.includes('slot-cancelled'))).toEqual([]);
  });

  it('ignore les créneaux futurs d’une formation en pause (BR-FOR-15)', () => {
    const paused = [{ ...FORMATION, status: 'paused' as const }];
    const result = planSchedule(input({ formations: paused, existingSlots: [base] }));
    expect(result.slots.some((slot) => slot.slotId === 'slot-x')).toBe(false);
  });

  it('signale un déplacement manuel hors jour d’étude et le recalcule', () => {
    const sunday = {
      ...base,
      slotId: 'slot-sunday',
      createdBy: 'learner' as const,
      startsAt: '2026-11-15T09:00:00.000Z',
      endsAt: '2026-11-15T10:00:00.000Z',
    };
    const result = planSchedule(input({ existingSlots: [sunday] }));
    expect(result.conflicts).toContainEqual(
      expect.objectContaining({ kind: 'overlap', slotIds: ['slot-sunday'], date: '2026-11-15' }),
    );
    expect(result.slots.some((slot) => slot.slotId === 'slot-sunday')).toBe(false);
  });

  it('signale un déplacement manuel qui chevauche un créneau déjà occupé', () => {
    const first = { ...base, slotId: 'slot-first', createdBy: 'learner' as const };
    const second = {
      ...base,
      slotId: 'slot-second',
      createdBy: 'learner' as const,
      startsAt: '2026-11-16T08:30:00.000Z',
      endsAt: '2026-11-16T09:30:00.000Z',
    };
    const result = planSchedule(input({ existingSlots: [first, second] }));
    expect(result.slots.some((slot) => slot.slotId === 'slot-first')).toBe(true);
    expect(result.conflicts).toContainEqual(expect.objectContaining({ slotIds: ['slot-second'] }));
  });

  it('ne replanifie pas un quiz global le jour où il en existe déjà un', () => {
    const quiz: ExistingPlannerSlot = {
      ...base,
      slotId: 'slot-quiz',
      formationId: null,
      moduleId: null,
      kind: 'global_quiz',
      title: 'Quiz global',
    };
    const result = planSchedule(input({ existingSlots: [quiz] }));
    const quizzes = result.slots.filter(
      (slot) => slot.kind === 'global_quiz' && localDateOf(slot.startsAt, TZ) === '2026-11-16',
    );
    expect(quizzes.map((slot) => slot.slotId)).toEqual(['slot-quiz']);
  });
});
