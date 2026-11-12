import { describe, expect, it } from 'vitest';

import { ENGINE } from '@learny/config/product';

import { EngineError } from '../errors';
import {
  addDays,
  daysBetween,
  instantAt,
  localDateOf,
  localMinutesOf,
  parseInstant,
} from '../time';
import type { Availability } from '../types';

import { findCompatibleSlots } from './find-compatible-slots';
import { planSchedule } from './plan';
import { replanSchedule } from './replan';
import type {
  ExistingPlannerSlot,
  PlanResult,
  PlanScheduleInput,
  PlannedSlot,
  PlannerFormation,
  PlannerPreferences,
} from './types';

const NOW = '2026-11-11T12:20:00.000Z';
const TZ = 'Europe/Paris';
const PARAMS = ENGINE.planner;

const AVAILABILITY: Availability = {
  hoursPerDay: 4,
  studyDays: [1, 2, 3, 4, 5],
  preferredSlots: ['matin', 'apres_midi'],
};

function preferences(overrides: Partial<Availability> = {}): PlannerPreferences {
  return {
    tz: TZ,
    availability: { ...AVAILABILITY, ...overrides },
    holidays: ['2026-11-11'],
  };
}

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
        chapters: [
          { chapterId: 'sap-m1-c1', position: 1, title: 'Chapitre 1' },
          { chapterId: 'sap-m1-c2', position: 2, title: 'Chapitre 2' },
        ],
      },
      {
        moduleId: 'sap-m2',
        position: 2,
        title: 'Module 2',
        hours: 5,
        chapters: [{ chapterId: 'sap-m2-c1', position: 1, title: 'Chapitre 3' }],
      },
    ],
  },
  {
    formationId: 'cg',
    title: 'Contrôle de gestion',
    endDate: '2026-11-27',
    modules: [
      {
        moduleId: 'cg-m1',
        position: 1,
        title: 'Module A',
        hours: 4,
        chapters: [{ chapterId: 'cg-m1-c1', position: 1, title: 'Chapitre A' }],
      },
    ],
  },
];

function input(overrides: Partial<PlanScheduleInput> = {}): PlanScheduleInput {
  return {
    formations: FORMATIONS,
    preferences: preferences(),
    params: PARAMS,
    now: NOW,
    ...overrides,
  };
}

function byDay(slots: readonly PlannedSlot[]): Map<string, PlannedSlot[]> {
  const days = new Map<string, PlannedSlot[]>();
  for (const slot of slots) {
    if (slot.status !== 'planned') continue;
    const day = localDateOf(slot.startsAt, TZ);
    const entries = days.get(day) ?? [];
    entries.push(slot);
    days.set(day, entries);
  }
  return days;
}

function minutesOf(slot: PlannedSlot): number {
  return (parseInstant(slot.endsAt) - parseInstant(slot.startsAt)) / 60_000;
}

describe('[SPEC-407] Planificateur', () => {
  it('CA-1 : deux formations ne dépassent jamais la capacité quotidienne et ne se chevauchent pas', () => {
    const result = planSchedule(input());
    expect(result.unscheduled).toEqual([]);
    const capacity = AVAILABILITY.hoursPerDay * 60;
    for (const [day, slots] of byDay(result.slots)) {
      expect(
        slots.reduce((total, slot) => total + minutesOf(slot), 0),
        day,
      ).toBeLessThanOrEqual(capacity);
      const ordered = [...slots].sort(
        (left, right) => parseInstant(left.startsAt) - parseInstant(right.startsAt),
      );
      for (let index = 1; index < ordered.length; index += 1) {
        const previous = ordered[index - 1];
        const current = ordered[index];
        if (previous === undefined || current === undefined) continue;
        expect(parseInstant(current.startsAt), `${day} ${current.slotId}`).toBeGreaterThanOrEqual(
          parseInstant(previous.endsAt),
        );
      }
    }
    expect(result.conflicts).toEqual([]);
  });

  it('CA-2 : chaque quiz de validation est suivi de sa marge de 60 min', () => {
    const result = planSchedule(input());
    const quizzes = result.slots.filter((slot) => slot.kind === 'validation_quiz');
    expect(quizzes.length).toBe(3);
    for (const quiz of quizzes) {
      const margin = result.slots.find(
        (slot) => slot.kind === 'buffer' && slot.startsAt === quiz.endsAt,
      );
      expect(margin, quiz.title).toBeDefined();
      expect(minutesOf(margin as PlannedSlot)).toBe(60);
    }
  });

  it('CA-2 : chaque journée d’étude reçoit un quiz global de 30 min en dernier', () => {
    const result = planSchedule(input());
    for (const [day, slots] of byDay(result.slots)) {
      const globals = slots.filter((slot) => slot.kind === 'global_quiz');
      expect(globals, day).toHaveLength(1);
      expect(minutesOf(globals[0] as PlannedSlot)).toBe(30);
      const latest = [...slots].sort(
        (left, right) => parseInstant(left.startsAt) - parseInstant(right.startsAt),
      );
      expect(latest.at(-1)?.kind).toBe('global_quiz');
    }
  });

  it('respecte jours d’étude, week-end et jours fériés', () => {
    const result = planSchedule(input());
    for (const slot of result.slots) {
      const day = localDateOf(slot.startsAt, TZ);
      expect(day).not.toBe('2026-11-11');
      const weekday = new Date(`${day}T00:00:00.000Z`).getUTCDay();
      expect(weekday).toBeGreaterThanOrEqual(1);
      expect(weekday).toBeLessThanOrEqual(5);
    }
  });

  it('CL-1 : refuse une disponibilité sans jour d’étude', () => {
    expect(() =>
      planSchedule(
        input({
          preferences: {
            tz: TZ,
            availability: { ...AVAILABILITY, studyDays: [] },
          },
        }),
      ),
    ).toThrow(EngineError);
    try {
      planSchedule(
        input({ preferences: { tz: TZ, availability: { ...AVAILABILITY, studyDays: [] } } }),
      );
    } catch (error) {
      expect((error as EngineError).code).toBe('INVALID_AVAILABILITY');
    }
  });

  it('CL-3 : deux formations de même fin sont ordonnées par identifiant', () => {
    const first = { ...(FORMATIONS[1] as PlannerFormation), endDate: '2026-11-25' };
    const formations = [
      { ...first, formationId: 'zeta' },
      { ...first, formationId: 'alpha' },
    ];
    const result = planSchedule(input({ formations }));
    const firstSlot = result.slots.find(
      (slot) => slot.formationId !== null && slot.kind === 'contributions',
    );
    expect(firstSlot?.formationId).toBe('alpha');
  });

  it('CA-3 : une séance manquée garde l’historique et crée un créneau futur distinct', () => {
    const base = planSchedule(input());
    const planned = base.slots.find((slot) => slot.kind === 'course');
    expect(planned).toBeDefined();
    if (planned === undefined) return;
    const missed: ExistingPlannerSlot = {
      slotId: 'slot-missed-1',
      formationId: planned.formationId,
      moduleId: planned.moduleId,
      kind: planned.kind,
      title: planned.title,
      startsAt: planned.startsAt,
      endsAt: planned.endsAt,
      status: 'missed',
      createdBy: 'planner',
    };
    const result = replanSchedule(
      input({ existingSlots: [missed], now: planned.endsAt, reason: 'session_missed' }),
    );
    const history = result.slots.find((slot) => slot.slotId === 'slot-missed-1');
    expect(history?.status).toBe('missed');
    const replay = result.slots.filter(
      (slot) =>
        slot.status === 'planned' &&
        slot.title === planned.title &&
        slot.slotId !== 'slot-missed-1',
    );
    expect(replay.length).toBeGreaterThan(0);
    expect(replay[0]?.slotId).not.toBe(planned.slotId);
  });

  it('CA-3 : une formation en pause ne reçoit aucun créneau futur mais garde ses terminés', () => {
    const done: ExistingPlannerSlot = {
      slotId: 'slot-done-1',
      formationId: 'sap',
      moduleId: 'sap-m1',
      kind: 'course',
      title: 'Cours terminé',
      startsAt: '2026-11-10T08:00:00.000Z',
      endsAt: '2026-11-10T09:00:00.000Z',
      status: 'done',
      createdBy: 'planner',
    };
    const paused = FORMATIONS.map((formation) =>
      formation.formationId === 'sap' ? { ...formation, status: 'paused' as const } : formation,
    );
    const result = planSchedule(input({ formations: paused, existingSlots: [done] }));
    expect(result.slots.some((slot) => slot.slotId === 'slot-done-1')).toBe(true);
    const future = result.slots.filter(
      (slot) =>
        slot.formationId === 'sap' &&
        slot.status === 'planned' &&
        parseInstant(slot.startsAt) >= parseInstant(NOW),
    );
    expect(future).toEqual([]);
  });

  it('préserve un déplacement manuel valide', () => {
    const manual: ExistingPlannerSlot = {
      slotId: 'slot-manual-1',
      formationId: 'cg',
      moduleId: 'cg-m1',
      kind: 'course',
      title: 'Cours — Module A',
      startsAt: '2026-11-20T13:00:00.000Z',
      endsAt: '2026-11-20T14:00:00.000Z',
      status: 'planned',
      createdBy: 'learner',
    };
    const result = planSchedule(input({ existingSlots: [manual] }));
    expect(result.slots.some((slot) => slot.slotId === 'slot-manual-1')).toBe(true);
  });

  it('CA-4 : une échéance impossible produit trois options chiffrées sans appliquer la moindre', () => {
    const tight = [
      {
        ...(FORMATIONS[0] as PlannerFormation),
        endDate: '2026-11-13',
      },
    ];
    const base = planSchedule(
      input({ formations: tight, preferences: preferences({ hoursPerDay: 3 }) }),
    );
    expect(base.deadlines[0]?.missed).toBe(true);
    expect(base.options.map((option) => option.kind)).toEqual([
      'shift_end',
      'increase_volume',
      'lighten',
    ]);
    const shift = base.options[0];
    expect(shift?.feasible).toBe(true);
    expect(shift?.extraDays).toBeGreaterThan(0);
    expect(base.options[2]?.removedMinutes).toBeGreaterThan(0);
    // No option is applied: a second run is identical.
    const again = planSchedule(
      input({ formations: tight, preferences: preferences({ hoursPerDay: 3 }) }),
    );
    expect(again.slots).toEqual(base.slots);
  });

  it('CL-4 : à 6 h/jour la capacité reste insuffisante, l’option volume est marquée non réalisable', () => {
    const huge: PlannerFormation = {
      formationId: 'huge',
      title: 'Huge',
      endDate: '2026-11-12',
      modules: [
        {
          moduleId: 'huge-m1',
          position: 1,
          title: 'Huge',
          hours: 20,
          chapters: [{ chapterId: 'huge-c1', position: 1 }],
        },
      ],
    };
    const result = planSchedule(
      input({
        formations: [huge],
        preferences: preferences({ hoursPerDay: 3 }),
        params: ENGINE.planner,
      }),
    );
    const volume = result.options.find((option) => option.kind === 'increase_volume');
    expect(volume?.feasible).toBe(false);
    expect(volume?.reason).toContain('6 h');
  });

  it('est déterministe et indépendant de l’ordre des formations', () => {
    const first = planSchedule(input());
    const second = planSchedule(input());
    expect(second).toEqual(first);
    const reversed = planSchedule(input({ formations: [...FORMATIONS].reverse() }));
    expect(reversed.slots).toEqual(first.slots);
  });

  it('place deux examens blancs et des sprints avant chaque épreuve', () => {
    const result = planSchedule(input());
    const mocks = result.slots.filter((slot) => slot.kind === 'mock_exam');
    expect(mocks).toHaveLength(2);
    expect(mocks.every((slot) => minutesOf(slot) === 40)).toBe(true);
    const sprints = result.slots.filter((slot) => slot.kind === 'sprint');
    expect(sprints.length).toBeGreaterThan(0);
    for (const sprint of sprints) {
      expect(minutesOf(sprint)).toBe(30);
      expect(sprint.startsAt < sprint.endsAt).toBe(true);
    }
  });

  it('CL-2 : un changement d’heure ne produit aucun créneau dans une heure inexistante', () => {
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
      formations: [dst],
      params: PARAMS,
      preferences: {
        tz: TZ,
        availability: {
          hoursPerDay: 6,
          studyDays: [7],
          preferredSlots: ['matin'],
        },
      },
      now: '2027-03-27T12:20:00.000Z',
    });
    for (const slot of result.slots) {
      const start = localMinutesOf(slot.startsAt, TZ);
      const end = localMinutesOf(slot.endsAt, TZ);
      expect(start).toBeLessThan(end);
      expect(start < 120 || start >= 180).toBe(true);
      const real = (parseInstant(slot.endsAt) - parseInstant(slot.startsAt)) / 60_000;
      expect(real).toBeGreaterThanOrEqual(end - start);
    }
  });

  it('ET-5 : refuse des paramètres hors bornes', () => {
    expect(() => planSchedule(input({ params: { ...PARAMS, globalQuizMinutes: 0 } }))).toThrow(
      EngineError,
    );
  });

  it('ET-2 : findCompatibleSlots renvoie trois créneaux triés sans chevauchement', () => {
    const base = planSchedule(input());
    const alternatives = findCompatibleSlots(
      { durationMinutes: 60, kind: 'course' },
      { now: NOW, params: PARAMS, slots: base.slots, holidays: ['2026-11-11'] },
      preferences(),
    );
    expect(alternatives).toHaveLength(3);
    const times = alternatives.map((slot) => parseInstant(slot.startsAt));
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    for (const alternative of alternatives) {
      expect(parseInstant(alternative.endsAt) - parseInstant(alternative.startsAt)).toBe(
        60 * 60_000,
      );
      for (const slot of base.slots) {
        const overlaps =
          parseInstant(alternative.startsAt) < parseInstant(slot.endsAt) &&
          parseInstant(slot.startsAt) < parseInstant(alternative.endsAt);
        expect(overlaps).toBe(false);
      }
    }
  });

  it('retourne un résultat vide sans formation', () => {
    const result: PlanResult = planSchedule(input({ formations: [] }));
    expect(result.slots).toEqual([]);
    expect(result.options).toEqual([]);
    expect(result.deadlines).toEqual([]);
  });

  it('place les activités dans l’ordre du programme', () => {
    const result = planSchedule(input());
    const titles = result.slots
      .filter((slot) => slot.formationId === 'sap' && slot.moduleId === 'sap-m1')
      .sort((left, right) => parseInstant(left.startsAt) - parseInstant(right.startsAt))
      .map((slot) => slot.kind);
    const courseIndex = titles.indexOf('course');
    const quizIndex = titles.indexOf('validation_quiz');
    const contributionIndex = titles.indexOf('contributions');
    expect(contributionIndex).toBeGreaterThanOrEqual(0);
    expect(contributionIndex).toBeLessThan(courseIndex);
    expect(courseIndex).toBeLessThan(quizIndex);
  });

  it('calcule la capacité restante par jour', () => {
    const result = planSchedule(input());
    for (const capacity of result.remainingCapacity) {
      expect(capacity.usedMinutes).toBeLessThanOrEqual(capacity.totalMinutes);
      expect(capacity.remainingMinutes).toBe(capacity.totalMinutes - capacity.usedMinutes);
    }
  });

  it('des jours fériés réduisent le planning sans trouer l’ordre', () => {
    const result = planSchedule(input());
    const holidays = result.slots.filter((slot) => localDateOf(slot.startsAt, TZ) === '2026-11-11');
    expect(holidays).toEqual([]);
    expect(addDays('2026-11-11', 1)).toBe('2026-11-12');
    expect(daysBetween('2026-11-11', '2026-11-25')).toBe(14);
    expect(instantAt('2026-11-12', '09:00', TZ)).toBe('2026-11-12T08:00:00.000Z');
  });
});
