import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { EngineError } from '../errors';
import { addDays, instantAt } from '../time';

import {
  CalculateStreakInputSchema,
  STREAK_ACTIVITY_KINDS,
  StreakResultSchema,
  calculateStreak,
} from './calculate';
import type {
  CalculateStreakInput,
  DailyActivityEntry,
  StreakActivityKind,
  StreakResult,
} from './calculate';
import {
  DetectMilestonesInputSchema,
  MILESTONE_KEY,
  MilestoneSchema,
  detectMilestones,
  moduleMilestoneKey,
} from './milestones';
import type { DetectMilestonesInput } from './milestones';

const FAST_CHECK = { seed: 20261111, numRuns: 100 } as const;
const PARIS = 'Europe/Paris';
const KIRITIMATI = 'Pacific/Kiritimati';
const PAGO_PAGO = 'Pacific/Pago_Pago';
const NEW_YORK = 'America/New_York';
const AT = '2026-11-11T12:20:00.000Z';
const PARAMS = {
  readingMinSeconds: 300,
  regularityDays: 14,
  maxLookbackDays: 3660,
} as const;
const MILESTONE_PARAMS = { notionsRetained: 100, streakDays: 30 } as const;

function activity(
  at: string,
  kind: StreakActivityKind = 'quiz',
  durationSeconds?: number,
): DailyActivityEntry {
  return durationSeconds === undefined ? { at, kind } : { at, kind, durationSeconds };
}

function input(overrides: Partial<CalculateStreakInput> = {}): CalculateStreakInput {
  return {
    dailyActivity: [],
    studyDays: [1, 2, 3, 4, 5],
    pauses: [],
    at: AT,
    timeZone: PARIS,
    params: PARAMS,
    ...overrides,
  };
}

function milestoneInput(overrides: Partial<DetectMilestonesInput> = {}): DetectMilestonesInput {
  return {
    previousKeys: [],
    validatedModules: [],
    masteredNotions: 0,
    streakDays: 0,
    params: MILESTONE_PARAMS,
    ...overrides,
  };
}

function statusOf(result: StreakResult, date: string): string | undefined {
  return result.calendar.find((day) => day.date === date)?.status;
}

function engineError(run: () => unknown, path?: string): EngineError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    const engine = error as EngineError;
    expect(engine.code).toBe('INVALID_INPUT');
    if (path !== undefined) expect(engine.details?.path).toBe(path);
    return engine;
  }
  throw new Error('aucune EngineError levée');
}

const WEEKEND_NON_PLANNED = {
  dailyActivity: [activity('2026-11-06T18:00:00.000Z'), activity('2026-11-09T18:00:00.000Z')],
  at: '2026-11-09T20:00:00.000Z',
} as const;

const MAIN_WEEK = {
  dailyActivity: [
    activity('2026-11-06T18:00:00.000Z'),
    activity('2026-11-09T18:00:00.000Z', 'exercise'),
    activity('2026-11-10T18:00:00.000Z', 'reading', 300),
  ],
  pauses: [{ startsOn: '2026-11-05', endsOn: '2026-11-05' }],
} as const;

describe('[SPEC-409] Série et jalons', () => {
  describe('CA-1 — week-end non prévu et série de deux jours', () => {
    it('compte vendredi et lundi comme deux jours consécutifs', () => {
      const result = calculateStreak(input(WEEKEND_NON_PLANNED));

      expect(result.days).toBe(2);
      expect(result.lastQualifyingDay).toBe('2026-11-09');
      expect(result.calendar).toHaveLength(14);
      expect(result.calendar.at(-1)?.date).toBe('2026-11-09');
      expect(statusOf(result, '2026-11-09')).toBe('studied');
      expect(statusOf(result, '2026-11-08')).toBe('neutral');
      expect(statusOf(result, '2026-11-07')).toBe('neutral');
      expect(statusOf(result, '2026-11-06')).toBe('studied');
      expect(statusOf(result, '2026-11-05')).toBe('missed');
    });

    it('affiche les 14 jours civils du plus ancien au plus récent', () => {
      const result = calculateStreak(input(WEEKEND_NON_PLANNED));
      const dates = result.calendar.map((day) => day.date);

      expect(dates).toEqual([
        '2026-10-27',
        '2026-10-28',
        '2026-10-29',
        '2026-10-30',
        '2026-10-31',
        '2026-11-01',
        '2026-11-02',
        '2026-11-03',
        '2026-11-04',
        '2026-11-05',
        '2026-11-06',
        '2026-11-07',
        '2026-11-08',
        '2026-11-09',
      ]);
      expect(new Set(dates).size).toBe(14);
    });
  });

  describe('CA-2 — jour manqué, pause et jour non prévu', () => {
    it('casse la série sur un jour prévu sans activité terminée', () => {
      const result = calculateStreak(
        input({
          dailyActivity: [activity('2026-11-09T18:00:00.000Z')],
        }),
      );

      expect(result.days).toBe(0);
      expect(result.lastQualifyingDay).toBe('2026-11-09');
      expect(statusOf(result, '2026-11-10')).toBe('missed');
    });

    it('conserve la série quand une pause couvre le jour prévu', () => {
      const result = calculateStreak(
        input({
          dailyActivity: [activity('2026-11-09T18:00:00.000Z')],
          pauses: [{ startsOn: '2026-11-10', endsOn: '2026-11-10' }],
        }),
      );

      expect(result.days).toBe(1);
      expect(statusOf(result, '2026-11-10')).toBe('neutral');
    });

    it('conserve la série quand le jour n’est pas prévu dans le rythme', () => {
      const result = calculateStreak(
        input({
          dailyActivity: [activity('2026-11-09T18:00:00.000Z')],
          studyDays: [1, 3, 4, 5],
        }),
      );

      expect(result.days).toBe(1);
      expect(statusOf(result, '2026-11-10')).toBe('neutral');
    });

    it('ne casse pas la série sous une pause qui couvre plusieurs jours', () => {
      const result = calculateStreak(
        input({
          dailyActivity: [activity('2026-11-06T18:00:00.000Z')],
          pauses: [
            { startsOn: '2026-11-09', endsOn: '2026-11-10' },
            { startsOn: '2026-11-07', endsOn: '2026-11-08' },
          ],
        }),
      );

      expect(result.days).toBe(1);
      expect(statusOf(result, '2026-11-10')).toBe('neutral');
      expect(statusOf(result, '2026-11-08')).toBe('neutral');
    });
  });

  describe('CA-3 — 14 états sur les dates locales, transitions d’heure', () => {
    it('garde les jours locaux à Paris au recul de 2026-10-25', () => {
      const result = calculateStreak(
        input({
          at: '2026-10-26T12:20:00.000Z',
          studyDays: [1, 2, 3, 4, 5, 6, 7],
          dailyActivity: [
            activity('2026-10-24T22:30:00.000Z'),
            activity('2026-10-25T22:30:00.000Z'),
            activity('2026-10-25T23:30:00.000Z'),
          ],
        }),
      );

      expect(result.calendar.at(-1)?.date).toBe('2026-10-26');
      expect(new Set(result.calendar.map((day) => day.date)).size).toBe(14);
      expect(statusOf(result, '2026-10-24')).toBe('missed');
      expect(statusOf(result, '2026-10-25')).toBe('studied');
      expect(statusOf(result, '2026-10-26')).toBe('studied');
      expect(result.days).toBe(2);
    });

    it('garde les jours locaux à Paris à l’avance de 2026-03-29', () => {
      const result = calculateStreak(
        input({
          at: '2026-03-30T12:00:00.000Z',
          studyDays: [1, 2, 3, 4, 5, 6, 7],
          dailyActivity: [
            activity('2026-03-29T00:30:00.000Z'),
            activity('2026-03-29T22:30:00.000Z'),
          ],
        }),
      );

      expect(result.calendar.at(-1)?.date).toBe('2026-03-30');
      expect(statusOf(result, '2026-03-29')).toBe('studied');
      expect(statusOf(result, '2026-03-30')).toBe('studied');
      expect(result.days).toBe(2);
    });

    it('garde les jours locaux à New York au recul de 2026-11-01', () => {
      const result = calculateStreak(
        input({
          at: '2026-11-02T05:30:00.000Z',
          timeZone: NEW_YORK,
          studyDays: [1, 2, 3, 4, 5, 6, 7],
          dailyActivity: [
            activity('2026-11-01T03:30:00.000Z'),
            activity('2026-11-01T04:30:00.000Z'),
            activity('2026-11-02T05:30:00.000Z'),
          ],
        }),
      );

      expect(result.calendar.at(-1)?.date).toBe('2026-11-02');
      expect(statusOf(result, '2026-10-31')).toBe('studied');
      expect(statusOf(result, '2026-11-01')).toBe('studied');
      expect(statusOf(result, '2026-11-02')).toBe('studied');
      expect(result.days).toBe(3);
    });

    it('déduit le jour local du fuseau, pas de la date UTC découpée', () => {
      const kiritimati = calculateStreak(
        input({ timeZone: KIRITIMATI, dailyActivity: [activity(AT)] }),
      );
      const pagoPago = calculateStreak(
        input({ timeZone: PAGO_PAGO, dailyActivity: [activity(AT)] }),
      );

      expect(kiritimati.calendar.at(-1)?.date).toBe('2026-11-12');
      expect(kiritimati.lastQualifyingDay).toBe('2026-11-12');
      expect(kiritimati.days).toBe(1);
      expect(pagoPago.calendar.at(-1)?.date).toBe('2026-11-11');
      expect(pagoPago.lastQualifyingDay).toBe('2026-11-11');
      expect(pagoPago.days).toBe(1);
    });
  });

  describe('CL-1 — le jour de référence encore en cours', () => {
    it('conserve la série de la veille sans la casser prématurément', () => {
      const result = calculateStreak(
        input({ dailyActivity: [activity('2026-11-10T18:00:00.000Z')] }),
      );

      expect(result.days).toBe(1);
      expect(statusOf(result, '2026-11-11')).toBe('neutral');
      expect(result.lastQualifyingDay).toBe('2026-11-10');
    });

    it('compte le jour de référence dès qu’une activité y est terminée', () => {
      const result = calculateStreak(
        input({
          dailyActivity: [
            activity('2026-11-10T18:00:00.000Z'),
            activity('2026-11-11T08:00:00.000Z'),
          ],
        }),
      );

      expect(result.days).toBe(2);
      expect(statusOf(result, '2026-11-11')).toBe('studied');
    });
  });

  describe('CL-4 — lecture de cinq minutes', () => {
    it('refuse 4 min 59 s et accepte exactement 5 min', () => {
      const tooShort = calculateStreak(
        input({ dailyActivity: [activity('2026-11-10T18:00:00.000Z', 'reading', 299)] }),
      );
      const exact = calculateStreak(
        input({ dailyActivity: [activity('2026-11-10T18:00:00.000Z', 'reading', 300)] }),
      );
      const longer = calculateStreak(
        input({ dailyActivity: [activity('2026-11-10T18:00:00.000Z', 'reading', 301)] }),
      );

      expect(tooShort.days).toBe(0);
      expect(tooShort.lastQualifyingDay).toBeNull();
      expect(exact.days).toBe(1);
      expect(exact.lastQualifyingDay).toBe('2026-11-10');
      expect(longer.days).toBe(1);
    });

    it('traite une lecture sans durée comme non qualifiante', () => {
      const result = calculateStreak(
        input({ dailyActivity: [activity('2026-11-10T18:00:00.000Z', 'reading')] }),
      );

      expect(result.days).toBe(0);
      expect(result.lastQualifyingDay).toBeNull();
    });
  });

  it.each(STREAK_ACTIVITY_KINDS)('accepte l’activité qualifiante %s', (kind) => {
    const result = calculateStreak(
      input({
        dailyActivity: [
          activity('2026-11-10T18:00:00.000Z', kind, kind === 'reading' ? 300 : undefined),
        ],
      }),
    );

    expect(result.days).toBe(1);
    expect(statusOf(result, '2026-11-10')).toBe('studied');
  });

  describe('normalisation et robustesse des entrées', () => {
    it('trie et déduplique sans muter les entrées', () => {
      const source = input({
        ...MAIN_WEEK,
        dailyActivity: [
          activity('2026-11-10T18:00:00.000Z', 'reading', 300),
          activity('2026-11-06T18:00:00.000Z'),
          activity('2026-11-06T19:00:00.000Z'),
          activity('2026-11-09T18:00:00.000Z', 'exercise'),
        ],
        pauses: [
          { startsOn: '2026-11-05', endsOn: '2026-11-06' },
          { startsOn: '2026-11-04', endsOn: '2026-11-05' },
        ],
        studyDays: [5, 1, 3, 3, 2, 4],
      });
      const snapshot = structuredClone(source);
      const result = calculateStreak(source);

      expect(result.days).toBe(3);
      expect(statusOf(result, '2026-11-05')).toBe('neutral');
      expect(statusOf(result, '2026-11-04')).toBe('neutral');
      expect(source).toEqual(snapshot);
    });

    it('compte une seule fois plusieurs activités le même jour local', () => {
      const result = calculateStreak(
        input({
          dailyActivity: [
            activity('2026-11-10T08:00:00.000Z'),
            activity('2026-11-10T12:00:00.000Z'),
            activity('2026-11-10T18:00:00.000Z'),
          ],
        }),
      );

      expect(result.days).toBe(1);
      expect(result.calendar.filter((day) => day.status === 'studied')).toHaveLength(1);
    });

    it('ignore une activité future par rapport au jour de référence', () => {
      const result = calculateStreak(
        input({ dailyActivity: [activity('2026-11-12T08:00:00.000Z')] }),
      );

      expect(result.days).toBe(0);
      expect(result.lastQualifyingDay).toBeNull();
    });

    it('respecte la borne de recherche et le nombre de cases configurés', () => {
      const result = calculateStreak(
        input({
          studyDays: [1, 2, 3, 4, 5, 6, 7],
          params: { ...PARAMS, maxLookbackDays: 3, regularityDays: 7 },
          dailyActivity: [
            activity('2026-11-11T08:00:00.000Z'),
            activity('2026-11-10T08:00:00.000Z'),
            activity('2026-11-09T08:00:00.000Z'),
            activity('2026-11-08T08:00:00.000Z'),
          ],
        }),
      );

      expect(result.days).toBe(3);
      expect(result.calendar).toHaveLength(7);
      expect(result.calendar.at(-1)?.date).toBe('2026-11-11');
    });

    it('retourne une série nulle sans activité', () => {
      const result = calculateStreak(input());

      expect(result.days).toBe(0);
      expect(result.lastQualifyingDay).toBeNull();
      expect(result.calendar).toHaveLength(14);
      expect(result.calendar.at(-1)?.status).toBe('neutral');
      expect(statusOf(result, '2026-11-10')).toBe('missed');
    });

    it('est déterministe et sérialisable sans perte', () => {
      const source = input(MAIN_WEEK);
      const first = calculateStreak(source);
      const second = calculateStreak(source);

      expect(first).toEqual(second);
      expect(CalculateStreakInputSchema.parse(source)).toEqual(source);
      expect(StreakResultSchema.parse(first)).toEqual(first);
      expect(JSON.parse(JSON.stringify(first))).toEqual(first);
    });

    it('reste répétable et borné sur des entrées générées', () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(fc.integer({ min: 0, max: 40 }), { maxLength: 40 }),
          fc.uniqueArray(fc.integer({ min: 1, max: 7 }), { minLength: 1, maxLength: 7 }),
          (offsets, studyDays) => {
            const dailyActivity = offsets.map((offset) =>
              activity(instantAt(addDays('2026-11-11', -offset), '12:00', PARIS)),
            );
            const source = input({
              dailyActivity,
              studyDays: studyDays as CalculateStreakInput['studyDays'],
              params: { ...PARAMS, maxLookbackDays: 30, regularityDays: 7 },
            });
            const first = calculateStreak(source);
            const second = calculateStreak(source);

            expect(first).toEqual(second);
            expect(first.days).toBeGreaterThanOrEqual(0);
            expect(first.days).toBeLessThanOrEqual(offsets.length);
            expect(first.days).toBeLessThanOrEqual(30);
            expect(first.calendar).toHaveLength(7);
            expect(new Set(first.calendar.map((day) => day.date)).size).toBe(7);
          },
        ),
        FAST_CHECK,
      );
    });
  });

  describe('entrées invalides', () => {
    it('refuse un instant, un fuseau ou une pause invalides avec le chemin Zod', () => {
      engineError(() => calculateStreak(input({ at: '2026-02-30T12:20:00.000Z' })), 'at');
      engineError(() => calculateStreak(input({ timeZone: 'Europe/Pariss' })), 'timeZone');
      engineError(
        () =>
          calculateStreak(input({ pauses: [{ startsOn: '2026-11-10', endsOn: '2026-11-09' }] })),
        'pauses.0',
      );
      engineError(() =>
        calculateStreak({ ...input(), unknown: true } as unknown as CalculateStreakInput),
      );
    });

    it('refuse un rythme vide et des bornes hors domaine', () => {
      engineError(() => calculateStreak(input({ studyDays: [] })), 'studyDays');
      engineError(
        () => calculateStreak(input({ params: { ...PARAMS, regularityDays: 0 } })),
        'params.regularityDays',
      );
      engineError(
        () => calculateStreak(input({ params: { ...PARAMS, readingMinSeconds: -1 } })),
        'params.readingMinSeconds',
      );
      engineError(
        () =>
          calculateStreak(
            input({
              dailyActivity: [activity('2026-11-10T18:00:00.000Z', 'reading', 1.5)],
            }),
          ),
        'dailyActivity.0.durationSeconds',
      );
    });
  });

  describe('CA-4 — jalons uniques', () => {
    it('déclenche chacun des trois jalons aux seuils exacts', () => {
      const milestones = detectMilestones(
        milestoneInput({
          validatedModules: ['sap-m1'],
          masteredNotions: 100,
          streakDays: 30,
        }),
      );

      expect(milestones).toEqual([
        { key: 'module_validated:sap-m1', kind: 'module_validated', moduleId: 'sap-m1' },
        { key: MILESTONE_KEY.notions, kind: 'notions_100', moduleId: null },
        { key: MILESTONE_KEY.streak, kind: 'streak_30', moduleId: null },
      ]);
    });

    it('ne déclenche pas les jalons un cran sous le seuil', () => {
      expect(detectMilestones(milestoneInput({ masteredNotions: 99, streakDays: 29 }))).toEqual([]);
    });

    it('déclenche le jalon de notions dès que le seuil est dépassé', () => {
      const milestones = detectMilestones(milestoneInput({ masteredNotions: 101 }));

      expect(milestones).toEqual([
        { key: MILESTONE_KEY.notions, kind: 'notions_100', moduleId: null },
      ]);
    });

    it('ne redouble aucun jalon après recalcul avec les clés précédentes', () => {
      const first = detectMilestones(
        milestoneInput({
          validatedModules: ['sap-m1', 'sap-m2'],
          masteredNotions: 100,
          streakDays: 30,
        }),
      );
      const second = detectMilestones(
        milestoneInput({
          previousKeys: first.map((milestone) => milestone.key),
          validatedModules: ['sap-m1', 'sap-m2'],
          masteredNotions: 100,
          streakDays: 30,
        }),
      );

      expect(first).toHaveLength(4);
      expect(second).toEqual([]);
    });

    it('déduplique les modules et les clés précédentes', () => {
      const milestones = detectMilestones(
        milestoneInput({
          previousKeys: ['module_validated:sap-m1', 'module_validated:sap-m1'],
          validatedModules: ['sap-m2', 'sap-m1', 'sap-m2'],
        }),
      );

      expect(milestones).toEqual([
        { key: 'module_validated:sap-m2', kind: 'module_validated', moduleId: 'sap-m2' },
      ]);
    });

    it('applique les seuils fournis par l’appelant', () => {
      const milestones = detectMilestones(
        milestoneInput({
          masteredNotions: 2,
          streakDays: 2,
          params: { notionsRetained: 2, streakDays: 2 },
        }),
      );

      expect(milestones.map((milestone) => milestone.kind)).toEqual(['notions_100', 'streak_30']);
      expect(moduleMilestoneKey('sap-m1')).toBe('module_validated:sap-m1');
    });

    it('est déterministe, sérialisable et sans mutation', () => {
      const source = milestoneInput({
        validatedModules: ['sap-m2', 'sap-m1'],
        masteredNotions: 100,
        streakDays: 30,
      });
      const snapshot = structuredClone(source);
      const first = detectMilestones(source);

      expect(first).toEqual(detectMilestones(source));
      expect(first.map((milestone) => MilestoneSchema.parse(milestone))).toEqual(first);
      expect(JSON.parse(JSON.stringify(first))).toEqual(first);
      expect(DetectMilestonesInputSchema.parse(source)).toEqual(source);
      expect(source).toEqual(snapshot);
    });

    it('refuse des entrées de jalon invalides', () => {
      engineError(() => detectMilestones(milestoneInput({ masteredNotions: -1 })));
      engineError(() => detectMilestones(milestoneInput({ masteredNotions: 1.5 })));
      engineError(
        () => detectMilestones(milestoneInput({ params: { notionsRetained: 0, streakDays: 30 } })),
        'params.notionsRetained',
      );
      engineError(() => detectMilestones(milestoneInput({ previousKeys: [''] })), 'previousKeys.0');
      engineError(
        () => detectMilestones(milestoneInput({ validatedModules: [''] })),
        'validatedModules.0',
      );
      engineError(() =>
        detectMilestones({
          ...milestoneInput(),
          unknown: true,
        } as unknown as DetectMilestonesInput),
      );
    });
  });
});
