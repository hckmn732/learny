import { describe, expect, it } from 'vitest';

import { ENGINE } from '@learny/config/product';
import { REFERENCE_NOW } from '@learny/learning-engine/fixtures';

import { EngineError } from '../../src/errors';
import { localDateOf, parseInstant, withParams } from '../../src/index';
import { planSchedule } from '../../src/planner/plan';
import { replanSchedule } from '../../src/planner/replan';
import type {
  ExistingPlannerSlot,
  PlanScheduleInput,
  PlannerFormation,
} from '../../src/planner/types';

const TZ = 'Europe/Paris';

const FORMATIONS: readonly PlannerFormation[] = [
  {
    formationId: 'sap',
    title: 'SAP',
    endDate: '2026-11-25',
    objectives: ['exam'],
    modules: [
      {
        moduleId: 'sap-m1',
        position: 1,
        title: 'Module 1',
        hours: 8,
        hasExercise: true,
        deadline: '2026-11-18',
        chapters: [
          { chapterId: 'sap-m1-c1', position: 1 },
          { chapterId: 'sap-m1-c2', position: 2 },
        ],
      },
      {
        moduleId: 'sap-m2',
        position: 2,
        title: 'Module 2',
        hours: 5,
        chapters: [{ chapterId: 'sap-m2-c1', position: 1 }],
      },
    ],
  },
];

function input(overrides: Partial<PlanScheduleInput> = {}): PlanScheduleInput {
  return {
    now: REFERENCE_NOW,
    params: withParams('planner'),
    preferences: {
      tz: TZ,
      availability: {
        hoursPerDay: 4,
        studyDays: [1, 2, 3, 4, 5],
        preferredSlots: ['matin', 'apres_midi'],
      },
      holidays: ['2026-11-11'],
    },
    formations: FORMATIONS,
    ...overrides,
  };
}

describe('[SPEC-407] composition', () => {
  it('replanifie à l’identique quand aucun événement ne change le plan (ET-3)', () => {
    const first = planSchedule(input());
    const second = replanSchedule(input({ reason: 'manual' }));
    expect(second.slots).toEqual(first.slots);
    expect(second.remainingCapacity).toEqual(first.remainingCapacity);
    expect(second.options).toEqual(first.options);
  });

  it('conserve terminés et déplacements manuels, rejoue une séance manquée (CA-3)', () => {
    const base = planSchedule(input());
    const course = base.slots.find((slot) => slot.kind === 'course');
    const quiz = base.slots.find((slot) => slot.kind === 'validation_quiz');
    expect(course).toBeDefined();
    expect(quiz).toBeDefined();
    if (course === undefined || quiz === undefined) return;
    const done: ExistingPlannerSlot = {
      slotId: 'existing-done',
      formationId: course.formationId,
      moduleId: course.moduleId,
      kind: course.kind,
      title: course.title,
      startsAt: course.startsAt,
      endsAt: course.endsAt,
      status: 'done',
      createdBy: 'planner',
    };
    const missed: ExistingPlannerSlot = {
      slotId: 'existing-missed',
      formationId: quiz.formationId,
      moduleId: quiz.moduleId,
      kind: quiz.kind,
      title: quiz.title,
      startsAt: quiz.startsAt,
      endsAt: quiz.endsAt,
      status: 'missed',
      createdBy: 'planner',
    };
    const manual: ExistingPlannerSlot = {
      slotId: 'existing-manual',
      formationId: 'sap',
      moduleId: 'sap-m2',
      kind: 'course',
      title: 'Cours — Module 2',
      startsAt: '2026-11-24T08:00:00.000Z',
      endsAt: '2026-11-24T09:30:00.000Z',
      status: 'planned',
      createdBy: 'learner',
    };
    const result = replanSchedule(
      input({
        existingSlots: [done, missed, manual],
        now: '2026-11-16T12:20:00.000Z',
        reason: 'session_missed',
      }),
    );
    expect(result.slots.find((slot) => slot.slotId === 'existing-done')?.status).toBe('done');
    expect(result.slots.find((slot) => slot.slotId === 'existing-missed')?.status).toBe('missed');
    expect(result.slots.find((slot) => slot.slotId === 'existing-manual')?.status).toBe('planned');
    const replay = result.slots.find(
      (slot) =>
        slot.status === 'planned' &&
        slot.kind === 'validation_quiz' &&
        slot.title === quiz.title &&
        slot.slotId !== 'existing-missed',
    );
    expect(replay).toBeDefined();
    expect(replay?.slotId).not.toBe(quiz.slotId);
  });

  it('respecte la capacité cumulée avec les fonctions de temps livrées (CA-1)', () => {
    const result = planSchedule(input());
    const perDay = new Map<string, number>();
    for (const slot of result.slots) {
      if (slot.status !== 'planned') continue;
      const date = localDateOf(slot.startsAt, TZ);
      const minutes = (parseInstant(slot.endsAt) - parseInstant(slot.startsAt)) / 60_000;
      perDay.set(date, (perDay.get(date) ?? 0) + minutes);
    }
    for (const [date, minutes] of perDay) {
      expect(minutes, date).toBeLessThanOrEqual(4 * 60);
    }
    expect([...perDay.keys()]).not.toContain('2026-11-11');
  });

  it('ne modifie jamais l’entrée lors du calcul des options (CA-4)', () => {
    const tight: PlannerFormation = {
      ...(FORMATIONS[0] as PlannerFormation),
      endDate: '2026-11-13',
    };
    const source = input({
      formations: [tight],
      preferences: {
        ...input().preferences,
        availability: { ...input().preferences.availability, hoursPerDay: 2 },
      },
    });
    const snapshot = JSON.stringify(source);
    const result = planSchedule(source);
    expect(JSON.stringify(source)).toBe(snapshot);
    expect(result.deadlines[0]?.missed).toBe(true);
    expect(result.options.length).toBeGreaterThanOrEqual(3);
    for (const option of result.options) {
      expect(option.feasible || option.reason !== null).toBe(true);
    }
  });

  it('compose avec le fuseau et les paramètres sur un changement d’heure (CL-2)', () => {
    const dst: PlannerFormation = {
      formationId: 'dst',
      title: 'DST',
      endDate: '2027-03-28',
      modules: [
        {
          moduleId: 'dst-m1',
          position: 1,
          title: 'DST',
          hours: 4,
          chapters: [{ chapterId: 'dst-c1', position: 1 }],
        },
      ],
    };
    const result = planSchedule({
      now: '2027-03-27T12:20:00.000Z',
      params: withParams('planner'),
      preferences: {
        tz: TZ,
        availability: { hoursPerDay: 6, studyDays: [7], preferredSlots: ['matin'] },
      },
      formations: [dst],
    });
    for (const slot of result.slots) {
      const real = (parseInstant(slot.endsAt) - parseInstant(slot.startsAt)) / 60_000;
      expect(real).toBeGreaterThan(0);
      expect(slot.startsAt).not.toMatch(/T02:/);
    }
  });

  it('les bornes produit restent celles de ENGINE.planner', () => {
    expect(withParams('planner').globalQuizMinutes).toBe(ENGINE.planner.globalQuizMinutes);
    expect(withParams('planner').bufferMinutes).toBe(60);
    expect(() => withParams('planner', { sprintDaysBeforeDefault: 4 })).toThrow(EngineError);
  });
});
