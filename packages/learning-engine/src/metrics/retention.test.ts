import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { REFERENCE_NOW } from '@learny/testing/clock';

import { EngineError } from '../errors';
import type { ModuleStatus, SlotKind, SlotStatus } from '../types';

import {
  CalculateProgressInputSchema,
  ProgressResultSchema,
  calculateProgress,
  type ProgressModule,
  type ProgressNotionState,
  type ProgressSlot,
} from './progress';
import {
  CalculateRetentionInputSchema,
  DEFAULT_RETENTION_HORIZONS,
  DEFAULT_RETENTION_TOLERANCE_DAYS,
  RetentionHorizonSchema,
  calculateRetention,
  type RetentionHorizon,
  type RetentionModule,
  type RetentionParams,
  type RetentionReview,
} from './retention';

const AT = REFERENCE_NOW;
const PARIS = 'Europe/Paris';
const PARAMS: RetentionParams = { horizonsDays: [30, 60], toleranceDays: 3 };

function retentionModule(
  moduleId: string,
  validatedAt: string | null,
  notionIds: readonly string[],
): RetentionModule {
  return { moduleId, validatedAt, notionIds };
}

function retentionReview(
  reviewId: string,
  notionId: string,
  reviewedAt: string,
  correct: boolean,
): RetentionReview {
  return { reviewId, notionId, reviewedAt, correct };
}

function horizon(result: readonly RetentionHorizon[], days: number): RetentionHorizon {
  const found = result.find((item) => item.horizonDays === days);
  expect(found, `horizon ${String(days)} absent`).toBeDefined();
  return found as RetentionHorizon;
}

function engineError(run: () => unknown): EngineError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    return error as EngineError;
  }
  throw new Error('aucune EngineError levée');
}

const PROGRESS_MODULES: ProgressModule[] = [
  { moduleId: 'm1', status: 'validated' },
  { moduleId: 'm2', status: 'validated' },
  { moduleId: 'm3', status: 'validated' },
  { moduleId: 'm4', status: 'open' },
  { moduleId: 'm5', status: 'open' },
  { moduleId: 'm6', status: 'locked' },
  { moduleId: 'm7', status: 'locked' },
];

function slot(
  slotId: string,
  status: SlotStatus,
  minutes: number,
  options: { kind?: SlotKind; movedFromId?: string | null } = {},
): ProgressSlot {
  const startMs = Date.parse('2026-11-09T09:00:00.000Z');
  return {
    slotId,
    moduleId: 'm1',
    kind: options.kind ?? 'course',
    status,
    startsAt: new Date(startMs).toISOString(),
    endsAt: new Date(startMs + minutes * 60_000).toISOString(),
    ...(options.movedFromId === undefined ? {} : { movedFromId: options.movedFromId }),
  };
}

const PROGRESS_SLOTS: ProgressSlot[] = [
  slot('s1', 'planned', 90),
  slot('s2', 'done', 60, { kind: 'revision' }),
  slot('s3', 'done', 30, { kind: 'exercise' }),
  slot('s4', 'cancelled', 45),
  slot('s5', 'missed', 30),
  slot('s6', 'moved', 60),
  slot('s7', 'planned', 60, { movedFromId: 's6' }),
  slot('s8', 'planned', 20),
  slot('s9', 'planned', 25, { movedFromId: 's8' }),
];

const NOTION_STATES: ProgressNotionState[] = [
  { notionId: 'n1', mastery: 80 },
  { notionId: 'n2', mastery: 79.99 },
  { notionId: 'n3', mastery: 100 },
  { notionId: 'n1', mastery: 90 },
];

describe('[SPEC-408] Rétention et indicateurs de progression', () => {
  describe('CA-1 — huit notions revues, six réussies', () => {
    const modules = [
      retentionModule('m1', '2026-09-12T10:00:00.000Z', ['n1', 'n2', 'n3', 'n4', 'n5']),
      retentionModule('m2', '2026-10-11T10:00:00.000Z', ['n6', 'n7', 'n8', 'n9']),
      retentionModule('m4', '2026-10-12T10:00:00.000Z', ['n10', 'n11', 'n12', 'n13', 'n14']),
    ];
    const reviews = [
      retentionReview('r-n6', 'n6', '2026-11-10T09:00:00.000Z', true),
      retentionReview('r-n7', 'n7', '2026-11-10T09:00:00.000Z', true),
      retentionReview('r-n8', 'n8', '2026-11-10T09:00:00.000Z', true),
      retentionReview('r-n9', 'n9', '2026-11-10T09:00:00.000Z', false),
      retentionReview('r-n10', 'n10', '2026-11-11T09:00:00.000Z', true),
      retentionReview('r-n11', 'n11', '2026-11-11T09:00:00.000Z', true),
      retentionReview('r-n12', 'n12', '2026-11-11T09:00:00.000Z', true),
      retentionReview('r-n13', 'n13', '2026-11-11T09:00:00.000Z', false),
      retentionReview('r-n10-late', 'n10', '2026-11-11T10:00:00.000Z', false),
      retentionReview('r-n14-out', 'n14', '2026-11-07T09:00:00.000Z', false),
      retentionReview('r-n1', 'n1', '2026-11-11T08:00:00.000Z', true),
      retentionReview('r-n2', 'n2', '2026-11-11T08:00:00.000Z', true),
      retentionReview('r-n3', 'n3', '2026-11-11T08:00:00.000Z', true),
      retentionReview('r-n4', 'n4', '2026-11-11T08:00:00.000Z', true),
      retentionReview('r-n5', 'n5', '2026-11-11T08:00:00.000Z', false),
    ];
    const result = calculateRetention({
      modules,
      reviews,
      at: AT,
      timeZone: PARIS,
      params: PARAMS,
    });

    it('vaut 75 % à un mois et exclut la révision hors fenêtre du dénominateur', () => {
      const oneMonth = horizon(result, 30);
      expect(oneMonth.windowStartDays).toBe(27);
      expect(oneMonth.windowEndDays).toBe(33);
      expect(oneMonth.reviewed).toBe(8);
      expect(oneMonth.successful).toBe(6);
      expect(oneMonth.rate).toBe(75);
      // m1 is eligible for the 30-day window but its only reviews fall at J+60.
      expect(oneMonth.eligible).toBe(14);
    });

    it('vaut 80 % à deux mois et ne compte pas deux fois la seconde révision de n10', () => {
      const twoMonths = horizon(result, 60);
      expect(twoMonths.windowStartDays).toBe(57);
      expect(twoMonths.windowEndDays).toBe(63);
      expect(twoMonths.reviewed).toBe(5);
      expect(twoMonths.successful).toBe(4);
      expect(twoMonths.rate).toBe(80);
      expect(twoMonths.eligible).toBe(5);
    });

    it('retourne les horizons dans un ordre stable', () => {
      expect(result.map((item) => item.horizonDays)).toEqual([30, 60]);
      for (const item of result) {
        expect(() => RetentionHorizonSchema.parse(item)).not.toThrow();
      }
    });
  });

  describe('CA-2 et CL-1 — aucune révision admissible', () => {
    it('retourne null et jamais 0 % quand le dénominateur est vide', () => {
      const result = calculateRetention({
        modules: [retentionModule('m1', '2026-10-12T10:00:00.000Z', ['n1', 'n2'])],
        reviews: [],
        at: AT,
        timeZone: PARIS,
        params: PARAMS,
      });
      const oneMonth = horizon(result, 30);
      expect(oneMonth.eligible).toBe(2);
      expect(oneMonth.reviewed).toBe(0);
      expect(oneMonth.successful).toBe(0);
      expect(oneMonth.rate).toBeNull();
      expect(oneMonth.rate).not.toBe(0);
      expect(horizon(result, 60).rate).toBeNull();
    });

    it('ne rend pas mesurable un module trop récent', () => {
      const result = calculateRetention({
        modules: [retentionModule('m-new', '2026-11-09T10:00:00.000Z', ['n1'])],
        reviews: [retentionReview('r1', 'n1', '2026-11-10T10:00:00.000Z', true)],
        at: AT,
        timeZone: PARIS,
        params: PARAMS,
      });
      expect(horizon(result, 30)).toMatchObject({
        eligible: 0,
        reviewed: 0,
        successful: 0,
        rate: null,
      });
    });
  });

  describe('CL-2 — bornes inclusives J+27..J+33 et J+57..J+63', () => {
    const modules = [
      retentionModule('m1', '2026-10-01T10:00:00.000Z', ['n27', 'n33', 'n26', 'n34']),
    ];
    const reviews = [
      retentionReview('r-27', 'n27', '2026-10-28T10:00:00.000Z', true),
      retentionReview('r-33', 'n33', '2026-11-03T10:00:00.000Z', false),
      retentionReview('r-26', 'n26', '2026-10-27T10:00:00.000Z', true),
      retentionReview('r-34', 'n34', '2026-11-04T10:00:00.000Z', true),
    ];
    const result = calculateRetention({
      modules,
      reviews,
      at: AT,
      timeZone: PARIS,
      params: PARAMS,
    });

    it('inclut exactement J+27 et J+33', () => {
      expect(horizon(result, 30)).toMatchObject({ reviewed: 2, successful: 1, rate: 50 });
    });

    it('exclut J+26 et J+34', () => {
      const oneMonth = horizon(result, 30);
      expect(oneMonth.reviewed).not.toBe(4);
      expect(horizon(result, 60).rate).toBeNull();
    });
  });

  describe('CL-3 et ET-3 — une notion, une contribution par horizon', () => {
    it('retient la première révision chronologique de la fenêtre', () => {
      const modules = [retentionModule('m1', '2026-10-01T10:00:00.000Z', ['n1'])];
      const reviews = [
        retentionReview('r-late', 'n1', '2026-10-29T10:00:00.000Z', false),
        retentionReview('r-first', 'n1', '2026-10-28T10:00:00.000Z', true),
      ];
      const result = calculateRetention({
        modules,
        reviews,
        at: AT,
        timeZone: PARIS,
        params: PARAMS,
      });
      expect(horizon(result, 30)).toMatchObject({ reviewed: 1, successful: 1, rate: 100 });
    });

    it('départage deux révisions simultanées par identifiant croissant', () => {
      const modules = [retentionModule('m1', '2026-10-01T10:00:00.000Z', ['n1'])];
      const reviews = [
        retentionReview('r-z', 'n1', '2026-10-28T10:00:00.000Z', false),
        retentionReview('r-a', 'n1', '2026-10-28T10:00:00.000Z', true),
      ];
      const result = calculateRetention({
        modules,
        reviews,
        at: AT,
        timeZone: PARIS,
        params: PARAMS,
      });
      expect(horizon(result, 30)).toMatchObject({ reviewed: 1, successful: 1, rate: 100 });
    });

    it('déduplique une révision rejouée et ignore les notions inconnues', () => {
      const modules = [retentionModule('m1', '2026-10-01T10:00:00.000Z', ['n1'])];
      const replayed = retentionReview('r-1', 'n1', '2026-10-28T10:00:00.000Z', true);
      const result = calculateRetention({
        modules,
        reviews: [
          replayed,
          replayed,
          retentionReview('r-2', 'n-x', '2026-10-28T10:00:00.000Z', true),
        ],
        at: AT,
        timeZone: PARIS,
        params: PARAMS,
      });
      expect(horizon(result, 30)).toMatchObject({ reviewed: 1, successful: 1, rate: 100 });
    });

    it('ignore une révision postérieure à l’instant d’évaluation', () => {
      const modules = [retentionModule('m1', '2026-10-12T10:00:00.000Z', ['n1'])];
      const result = calculateRetention({
        modules,
        reviews: [retentionReview('r-future', 'n1', '2026-11-11T12:20:00.001Z', true)],
        at: AT,
        timeZone: PARIS,
        params: PARAMS,
      });
      expect(horizon(result, 30).reviewed).toBe(0);
      expect(horizon(result, 30).rate).toBeNull();
    });
  });

  describe('ET-5 — jours calendaires du fuseau et changement d’heure', () => {
    const modules = [retentionModule('m1', '2026-10-11T22:30:00.000Z', ['n1'])];
    const reviews = [retentionReview('r1', 'n1', '2026-11-07T22:30:00.000Z', true)];

    it('exclut à Paris quand le jour local tombe à J+26', () => {
      const result = calculateRetention({
        modules,
        reviews,
        at: AT,
        timeZone: PARIS,
        params: PARAMS,
      });
      expect(horizon(result, 30)).toMatchObject({ eligible: 1, reviewed: 0, rate: null });
    });

    it('inclut en UTC quand le même instant tombe à J+27', () => {
      const result = calculateRetention({
        modules,
        reviews,
        at: AT,
        timeZone: 'UTC',
        params: PARAMS,
      });
      expect(horizon(result, 30)).toMatchObject({ eligible: 1, reviewed: 1, rate: 100 });
    });

    it('prend le fuseau et les paramètres par défaut quand ils sont omis', () => {
      const result = calculateRetention({
        modules: [retentionModule('m1', '2026-10-01T10:00:00.000Z', ['n1'])],
        reviews: [retentionReview('r1', 'n1', '2026-10-28T10:00:00.000Z', true)],
        at: AT,
      });
      expect(result.map((item) => item.horizonDays)).toEqual([...DEFAULT_RETENTION_HORIZONS]);
      expect(result[0]?.windowStartDays).toBe(30 - DEFAULT_RETENTION_TOLERANCE_DAYS);
      expect(result[0]?.windowEndDays).toBe(30 + DEFAULT_RETENTION_TOLERANCE_DAYS);
      expect(result[0]?.rate).toBe(100);
    });
  });

  describe('paramètres, ordre et répétabilité', () => {
    it('trie et déduplique les horizons fournis', () => {
      const result = calculateRetention({
        modules: [retentionModule('m1', '2026-10-01T10:00:00.000Z', ['n1'])],
        reviews: [retentionReview('r1', 'n1', '2026-10-31T10:00:00.000Z', true)],
        at: AT,
        timeZone: PARIS,
        params: { horizonsDays: [60, 30, 30], toleranceDays: 0 },
      });
      expect(result.map((item) => item.horizonDays)).toEqual([30, 60]);
      expect(result[0]?.windowStartDays).toBe(30);
      expect(result[0]?.windowEndDays).toBe(30);
    });

    it('est invariante à l’ordre des modules et des révisions', () => {
      const modules = [
        retentionModule('m1', '2026-10-01T10:00:00.000Z', ['n1', 'n2']),
        retentionModule('m2', '2026-09-12T10:00:00.000Z', ['n3']),
        retentionModule('m3', null, ['n4']),
      ];
      const reviews = [
        retentionReview('r1', 'n1', '2026-10-28T10:00:00.000Z', true),
        retentionReview('r2', 'n2', '2026-10-29T10:00:00.000Z', false),
        retentionReview('r3', 'n3', '2026-11-11T08:00:00.000Z', true),
      ];
      const expected = calculateRetention({
        modules,
        reviews,
        at: AT,
        timeZone: PARIS,
        params: PARAMS,
      });
      fc.assert(
        fc.property(
          fc.shuffledSubarray(modules, { minLength: modules.length }),
          fc.shuffledSubarray(reviews, { minLength: reviews.length }),
          (shuffledModules, shuffledReviews) => {
            const actual = calculateRetention({
              modules: shuffledModules,
              reviews: shuffledReviews,
              at: AT,
              timeZone: PARIS,
              params: PARAMS,
            });
            expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
          },
        ),
        { seed: 20261111, numRuns: 50 },
      );
    });

    it('refuse les bornes invalides à la frontière', () => {
      const base = {
        modules: [],
        reviews: [],
        at: AT,
      };
      expect(
        engineError(() =>
          calculateRetention({ ...base, params: { horizonsDays: [], toleranceDays: 3 } }),
        ).code,
      ).toBe('INVALID_INPUT');
      expect(
        engineError(() =>
          calculateRetention({ ...base, params: { horizonsDays: [3], toleranceDays: 3 } }),
        ).code,
      ).toBe('INVALID_INPUT');
      expect(
        engineError(() => calculateRetention({ ...base, at: '2026-02-30T00:00:00.000Z' })).code,
      ).toBe('INVALID_INPUT');
      expect(
        engineError(() => calculateRetention({ ...base, timeZone: 'Mars/Olympus' })).code,
      ).toBe('INVALID_INPUT');
      expect(() =>
        CalculateRetentionInputSchema.parse({
          ...base,
          modules: [
            {
              moduleId: 'm1',
              validatedAt: '2026-10-01T10:00:00.000Z',
              notionIds: ['n1'],
              extra: true,
            },
          ],
        }),
      ).toThrow();
    });
  });

  describe('CA-3 — avancement et notions maîtrisées', () => {
    it('donne 42,857… % pour trois modules validés sur sept', () => {
      const result = calculateProgress({
        modules: PROGRESS_MODULES,
        slots: [],
        notionStates: [],
      });
      expect(result.validatedModules).toBe(3);
      expect(result.totalModules).toBe(7);
      expect(result.progressPercent).toBe((3 / 7) * 100);
      expect(result.progressPercent).toBeCloseTo(42.857142857, 9);
      expect(result.status).toBe('in_progress');
      expect(result.plannedMinutes).toBe(0);
      expect(result.completedMinutes).toBe(0);
      expect(result.masteredNotions).toBe(0);
    });

    it('compte les notions au seuil 80 inclus et ignore 79,99', () => {
      const result = calculateProgress({
        modules: PROGRESS_MODULES,
        slots: [],
        notionStates: NOTION_STATES,
      });
      expect(result.masteredNotions).toBe(2);
    });

    it('accepte un seuil fourni par l’appelant', () => {
      const result = calculateProgress({
        modules: PROGRESS_MODULES,
        slots: [],
        notionStates: [
          { notionId: 'n1', mastery: 85 },
          { notionId: 'n2', mastery: 90 },
        ],
        masteryThreshold: 90,
      });
      expect(result.masteredNotions).toBe(1);
    });
  });

  describe('CA-4 et CL-5 — heures prévues, faites et créneaux déplacés', () => {
    const result = calculateProgress({
      modules: PROGRESS_MODULES,
      slots: PROGRESS_SLOTS,
      notionStates: NOTION_STATES,
    });

    it('exclut les créneaux annulés et manqués des heures faites', () => {
      expect(result.plannedMinutes).toBe(295);
      expect(result.completedMinutes).toBe(90);
    });

    it('ne compte pas deux fois un créneau déplacé, même si son statut est resté planifié', () => {
      // s6 (moved) and s8 (superseded) disappear; s7 and s9 replace them.
      expect(result.plannedMinutes).toBe(90 + 60 + 30 + 30 + 60 + 25);
      expect(result.completedMinutes).toBe(90);
      expect(result.completedMinutes).not.toBe(90 + 45);
    });

    it('conserve les minutes fractionnaires exactes', () => {
      const startMs = Date.parse('2026-11-09T09:00:00.000Z');
      const fractional = calculateProgress({
        modules: [],
        slots: [
          {
            slotId: 's-fraction',
            moduleId: null,
            kind: 'micro_session',
            status: 'done',
            startsAt: new Date(startMs).toISOString(),
            endsAt: new Date(startMs + 90_000).toISOString(),
          },
        ],
        notionStates: [],
      });
      expect(fractional.plannedMinutes).toBe(1.5);
      expect(fractional.completedMinutes).toBe(1.5);
    });
  });

  describe('CA-3 et CL-4 — formation sans module et formation complète', () => {
    it('retourne 0 et un statut explicite sans division par zéro', () => {
      const result = calculateProgress({ modules: [], slots: [], notionStates: [] });
      expect(result).toMatchObject({
        validatedModules: 0,
        totalModules: 0,
        progressPercent: 0,
        plannedMinutes: 0,
        completedMinutes: 0,
        masteredNotions: 0,
        status: 'no_modules',
      });
    });

    it('marque une formation entièrement validée comme terminée', () => {
      const result = calculateProgress({
        modules: [
          { moduleId: 'm1', status: 'validated' },
          { moduleId: 'm2', status: 'validated' },
        ],
        slots: [],
        notionStates: [],
      });
      expect(result.progressPercent).toBe(100);
      expect(result.status).toBe('complete');
    });
  });

  describe('robustesse des entrées', () => {
    it('est invariante à l’ordre et déduplique les lignes rejouées', () => {
      const direct = calculateProgress({
        modules: PROGRESS_MODULES,
        slots: PROGRESS_SLOTS,
        notionStates: NOTION_STATES,
      });
      const replayed = calculateProgress({
        modules: [
          ...PROGRESS_MODULES,
          { moduleId: 'm1', status: 'validated' },
          { moduleId: 'm4', status: 'open' },
        ],
        slots: [...PROGRESS_SLOTS].reverse(),
        notionStates: [...NOTION_STATES].reverse(),
      });
      expect(replayed).toEqual(direct);
      expect(replayed.validatedModules).toBe(3);
    });

    it('retourne un résultat sérialisable sans perte', () => {
      const result = calculateProgress({
        modules: PROGRESS_MODULES,
        slots: PROGRESS_SLOTS,
        notionStates: NOTION_STATES,
      });
      const roundTrip = ProgressResultSchema.parse(JSON.parse(JSON.stringify(result)));
      expect(roundTrip).toEqual(result);
      expect(() =>
        CalculateProgressInputSchema.parse({
          modules: PROGRESS_MODULES,
          slots: PROGRESS_SLOTS,
          notionStates: NOTION_STATES,
        }),
      ).not.toThrow();
    });

    it('refuse un créneau qui ne finit pas après son début', () => {
      const invalid: ProgressSlot = {
        slotId: 's-bad',
        kind: 'course',
        status: 'planned',
        startsAt: '2026-11-09T09:00:00.000Z',
        endsAt: '2026-11-09T09:00:00.000Z',
      };
      const error = engineError(() =>
        calculateProgress({ modules: [], slots: [invalid], notionStates: [] }),
      );
      expect(error.code).toBe('INVALID_INPUT');
      expect(error.details?.path).toContain('slots.0');
    });

    it('refuse une maîtrise hors de 0..100', () => {
      const error = engineError(() =>
        calculateProgress({
          modules: [],
          slots: [],
          notionStates: [{ notionId: 'n1', mastery: 101 }],
        }),
      );
      expect(error.code).toBe('INVALID_INPUT');
    });

    it('refuse un statut de module inconnu', () => {
      const error = engineError(() =>
        calculateProgress({
          modules: [{ moduleId: 'm1', status: 'done' as ModuleStatus }],
          slots: [],
          notionStates: [],
        }),
      );
      expect(error.code).toBe('INVALID_INPUT');
    });
  });
});
