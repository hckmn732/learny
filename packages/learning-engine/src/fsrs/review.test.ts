import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { ENGINE } from '@learny/config/product';
import { REFERENCE_NOW } from '@learny/testing/clock';

import { EngineError } from '../errors';
import { buildCard } from '../fixtures/builders';
import { addDays, instantAt } from '../time';
import { SerializedFsrsCardSchema } from '../types';
import type { BrickFormat, FsrsRating, SerializedFsrsCard } from '../types';

import { personalMedianMs, recentValidTimes } from './median';
import type { TimedResponse } from './median';
import { FSRS_RATINGS, applyReview, createNotionCard, gradeReview, previewGrades } from './review';
import type { GradeReviewInput, GradeSettings } from './review';

const SETTINGS: GradeSettings = ENGINE.fsrs;
const FAST_CHECK = { seed: 20261111, numRuns: 200 } as const;
const START = '2026-09-01';
const NOW = REFERENCE_NOW;
const RATING_RANK: Readonly<Record<FsrsRating, number>> = {
  easy: 0,
  good: 1,
  hard: 2,
  again: 3,
};

function responseAt(
  index: number,
  timeMs: number | null,
  format: BrickFormat = 'choice_question',
): TimedResponse {
  return {
    answerId: `a-${String(index).padStart(3, '0')}`,
    answeredAt: instantAt(addDays(START, index), '09:00', 'UTC'),
    format,
    timeMs,
  };
}

function historyOf(times: readonly (number | null)[], format: BrickFormat = 'choice_question') {
  return times.map((timeMs, index) => responseAt(index, timeMs, format));
}

function input(partial: Partial<GradeReviewInput> = {}): GradeReviewInput {
  return {
    correct: true,
    timeMs: 20_000,
    format: 'choice_question',
    history: [],
    settings: SETTINGS,
    ...partial,
  };
}

function engineError(run: () => unknown, code: string, path?: string): EngineError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    const engine = error as EngineError;
    expect(engine.code).toBe(code);
    if (path !== undefined) expect(engine.details?.path).toBe(path);
    return engine;
  }
  throw new Error('aucune EngineError levée');
}

function deepFreeze<T>(value: T): T {
  if (typeof value === 'object' && value !== null) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

describe('[SPEC-402] Répétition espacée FSRS par notion', () => {
  describe('note déduite de la justesse et du temps (CA-1, BR-MEM-02)', () => {
    it.each([
      ['faux très rapide', false, 1_000, 'again'],
      ['faux lent', false, 90_000, 'again'],
      ['juste 9 s', true, 9_000, 'easy'],
      ['juste 10 s (frontière)', true, 10_000, 'good'],
      ['juste 20 s', true, 20_000, 'good'],
      ['juste 40 s (frontière)', true, 40_000, 'good'],
      ['juste 41 s', true, 41_000, 'hard'],
    ] as const)('%s → %s', (_label, correct, timeMs, expected) => {
      const decision = gradeReview(input({ correct, timeMs }));
      expect(decision.rating).toBe(expected);
      expect(decision.medianMs).toBe(20_000);
    });

    it('n’a besoin d’aucun historique : médiane 20 s et Good à 20 s (CL-1)', () => {
      const decision = gradeReview(input());
      expect(decision.rating).toBe('good');
      expect(decision.reason).toBe('within_median');
      expect(decision.medianMs).toBe(20_000);
    });

    it('garde Good aux bornes exactes avec une autre médiane (CL-2)', () => {
      const history = historyOf([30_000, 30_000, 30_000, 30_000, 30_000]);
      expect(gradeReview(input({ history, timeMs: 15_000 })).rating).toBe('good');
      expect(gradeReview(input({ history, timeMs: 60_000 })).rating).toBe('good');
      expect(gradeReview(input({ history, timeMs: 14_999 })).rating).toBe('easy');
      expect(gradeReview(input({ history, timeMs: 60_001 })).rating).toBe('hard');
    });

    it('fait prévaloir Again sur la durée d’une réponse fausse (CL-3)', () => {
      expect(gradeReview(input({ correct: false, timeMs: 0 })).rating).toBe('again');
      expect(gradeReview(input({ correct: false, timeMs: 0 })).reason).toBe('incorrect');
    });

    it('ne note pas une réponse incomplète', () => {
      const decision = gradeReview(input({ correct: null }));
      expect(decision.rating).toBeNull();
      expect(decision.reason).toBe('incomplete');
      expect(gradeReview(input({ timeMs: null })).rating).toBeNull();
    });

    it('grade une carte de rappel par son auto-évaluation, sans choix → aucune mise à jour (CL-4)', () => {
      const noChoice = gradeReview(input({ format: 'recall_card', correct: null, timeMs: null }));
      expect(noChoice.rating).toBeNull();
      expect(noChoice.reason).toBe('incomplete');

      for (const rating of FSRS_RATINGS) {
        const decision = gradeReview(
          input({ format: 'recall_card', correct: false, timeMs: 0, selfRating: rating }),
        );
        expect(decision.rating).toBe(rating);
        expect(decision.reason).toBe('self_rating');
      }
    });

    it('ignore une auto-évaluation fournie hors carte de rappel', () => {
      const decision = gradeReview(input({ correct: true, timeMs: 9_000, selfRating: 'again' }));
      expect(decision.rating).toBe('easy');
      expect(decision.reason).toBe('too_fast');
    });
  });

  describe('médiane personnelle (CA-2, EF-3, ET-3)', () => {
    it('vaut 20 s avant cinq réponses valides', () => {
      expect(personalMedianMs([], 'choice_question', SETTINGS)).toBe(20_000);
      expect(
        personalMedianMs(historyOf([1_000, 2_000, 3_000, 4_000]), 'choice_question', SETTINGS),
      ).toBe(20_000);
    });

    it('ignore 0, les valeurs négatives, non finies et manquantes', () => {
      const history = historyOf([
        0,
        -1,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        null,
        1_000,
        2_000,
        3_000,
        4_000,
        5_000,
      ]);
      expect(recentValidTimes(history, 'choice_question', SETTINGS)).toEqual([
        5_000, 4_000, 3_000, 2_000, 1_000,
      ]);
      expect(personalMedianMs(history, 'choice_question', SETTINGS)).toBe(3_000);
    });

    it('ne retient que le format demandé', () => {
      const history = [
        ...historyOf([10_000, 10_000, 10_000, 10_000, 10_000]),
        ...historyOf([90_000, 90_000, 90_000, 90_000, 90_000], 'cloze').map((entry, index) => ({
          ...entry,
          answerId: `cloze-${String(index)}`,
          answeredAt: addDays(START, index + 10) + 'T09:00:00.000Z',
        })),
      ];
      expect(personalMedianMs(history, 'choice_question', SETTINGS)).toBe(10_000);
      expect(personalMedianMs(history, 'cloze', SETTINGS)).toBe(90_000);
    });

    it('garde les 50 réponses valides les plus récentes, quel que soit l’ordre d’entrée', () => {
      const history = historyOf([
        ...Array.from({ length: 10 }, () => 99_000),
        ...Array.from({ length: 50 }, () => 10_000),
      ]);
      const reversed = [...history].reverse();
      expect(personalMedianMs(history, 'choice_question', SETTINGS)).toBe(10_000);
      expect(personalMedianMs(reversed, 'choice_question', SETTINGS)).toBe(10_000);
      expect(recentValidTimes(history, 'choice_question', SETTINGS)).toEqual(
        Array.from({ length: 50 }, () => 10_000),
      );
      expect(history.map((entry) => entry.timeMs)).toEqual([
        ...Array.from({ length: 10 }, () => 99_000),
        ...Array.from({ length: 50 }, () => 10_000),
      ]);
    });

    it('moyenne les deux valeurs centrales d’un échantillon pair', () => {
      const history = historyOf([10_000, 20_000, 30_000, 40_000, 50_000, 60_000]);
      expect(personalMedianMs(history, 'choice_question', SETTINGS)).toBe(35_000);
      expect(personalMedianMs([...history].reverse(), 'choice_question', SETTINGS)).toBe(35_000);
    });

    it('départage deux réponses au même instant sans dépendre de l’ordre', () => {
      const a: TimedResponse = {
        answerId: 'a',
        answeredAt: NOW,
        format: 'choice_question',
        timeMs: 10_000,
      };
      const b: TimedResponse = {
        answerId: 'b',
        answeredAt: NOW,
        format: 'choice_question',
        timeMs: 30_000,
      };
      const five = [
        a,
        b,
        ...historyOf([20_000, 20_000, 20_000]).map((entry) => ({ ...entry, answeredAt: NOW })),
      ];
      expect(personalMedianMs(five, 'choice_question', SETTINGS)).toBe(
        personalMedianMs([...five].reverse(), 'choice_question', SETTINGS),
      );
    });

    it('refuse des bornes incohérentes', () => {
      engineError(
        () => personalMedianMs([], 'choice_question', { ...SETTINGS, medianWindow: 0 }),
        'INVALID_PARAM',
        'medianWindow',
      );
      engineError(
        () => personalMedianMs([], 'choice_question', { ...SETTINGS, medianMinSamples: 0 }),
        'INVALID_PARAM',
        'medianMinSamples',
      );
      engineError(
        () => personalMedianMs([], 'choice_question', { ...SETTINGS, medianMinSamples: 51 }),
        'INVALID_PARAM',
        'medianMinSamples',
      );
      engineError(
        () => personalMedianMs([], 'choice_question', { ...SETTINGS, defaultMedianMs: 0 }),
        'INVALID_PARAM',
        'defaultMedianMs',
      );
      engineError(
        () => personalMedianMs([], 'choice_question', { ...SETTINGS, defaultMedianMs: Number.NaN }),
        'INVALID_PARAM',
        'defaultMedianMs',
      );
    });

    it('refuse un historique ou un instant invalide', () => {
      engineError(
        () => personalMedianMs(null as unknown as TimedResponse[], 'choice_question', SETTINGS),
        'INVALID_INPUT',
        'history',
      );
      engineError(
        () =>
          personalMedianMs(
            [
              {
                answerId: 'a',
                answeredAt: '2026-11-11 09:00',
                format: 'choice_question',
                timeMs: 10_000,
              },
            ],
            'choice_question',
            SETTINGS,
          ),
        'INVALID_INPUT',
        'history.0.answeredAt',
      );
    });
  });

  describe('carte et échéances (CA-3, CA-4, EF-1, ET-2)', () => {
    it('crée une carte neuve à l’instant fourni', () => {
      const card = createNotionCard(NOW, 0.9);
      expect(card).toEqual(buildCard({ due: NOW }));
      expect(card.state).toBe('new');
      expect(card.last_review).toBeNull();
      expect(SerializedFsrsCardSchema.parse(card)).toEqual(card);
    });

    it('prévisualise les quatre échéances dans l’ordre stable sans muter la carte', () => {
      const card = deepFreeze(createNotionCard(NOW, 0.9));
      const preview = previewGrades(card, NOW, 0.9);
      expect(Object.keys(preview)).toEqual(['again', 'hard', 'good', 'easy']);
      expect(preview.again).toBe('2026-11-11T12:21:00.000Z');
      expect(preview.hard).toBe('2026-11-11T12:26:00.000Z');
      expect(preview.good).toBe('2026-11-11T12:30:00.000Z');
      expect(preview.easy).toBe('2026-11-19T12:20:00.000Z');
      expect(previewGrades(card, NOW, 0.9)).toEqual(preview);
      expect(card).toEqual(buildCard({ due: NOW }));
    });

    it('applique exactement l’échéance prévisualisée pour chaque note', () => {
      const card = deepFreeze(createNotionCard(NOW, 0.9));
      const preview = previewGrades(card, NOW, 0.9);
      for (const rating of FSRS_RATINGS) {
        const applied = applyReview(card, rating, NOW, 0.9);
        expect(applied.dueAt).toBe(preview[rating]);
        expect(applied.card.due).toBe(preview[rating]);
        expect(SerializedFsrsCardSchema.parse(applied.card)).toEqual(applied.card);
      }
      expect(card).toEqual(buildCard({ due: NOW }));
    });

    it('rejoue la même carte, note et instant à l’identique (CL-5)', () => {
      const card = deepFreeze(buildCard());
      const first = applyReview(card, 'good', NOW, 0.9);
      const second = applyReview(card, 'good', NOW, 0.9);
      expect(second).toEqual(first);
      expect(card).toEqual(buildCard());
      expect(applyReview(first.card, 'good', NOW, 0.9)).toEqual(
        applyReview(first.card, 'good', NOW, 0.9),
      );
    });

    it('produit des échéances reproductibles pour 0,85, 0,90 et 0,95 (CA-4)', () => {
      const card = createNotionCard(NOW, 0.9);
      const previews = [0.85, 0.9, 0.95].map((retention) => previewGrades(card, NOW, retention));
      expect(previews[0]?.easy).not.toBe(previews[1]?.easy);
      expect(previews[1]?.easy).not.toBe(previews[2]?.easy);
      expect(previews[0]).not.toEqual(previews[2]);
      for (const retention of [0.85, 0.9, 0.95]) {
        expect(previewGrades(card, NOW, retention)).toEqual(previewGrades(card, NOW, retention));
        expect(applyReview(card, 'good', NOW, retention)).toEqual(
          applyReview(card, 'good', NOW, retention),
        );
      }
    });

    it('refuse une rétention hors de ]0, 1[', () => {
      for (const retention of [0, 1, -0.1, 1.1, Number.NaN]) {
        engineError(() => createNotionCard(NOW, retention), 'INVALID_PARAM', 'retention');
        engineError(() => previewGrades(buildCard(), NOW, retention), 'INVALID_PARAM', 'retention');
        engineError(
          () => applyReview(buildCard(), 'good', NOW, retention),
          'INVALID_PARAM',
          'retention',
        );
      }
    });

    it('refuse un instant, une note ou une carte invalides', () => {
      engineError(() => createNotionCard('2026-11-11 12:20', 0.9), 'INVALID_INSTANT');
      engineError(
        () => applyReview(buildCard(), 'perfect' as FsrsRating, NOW, 0.9),
        'INVALID_INPUT',
        'grade',
      );
      engineError(
        () =>
          applyReview(
            { ...buildCard(), state: 'unknown' } as unknown as SerializedFsrsCard,
            'good',
            NOW,
            0.9,
          ),
        'INVALID_INPUT',
      );
      engineError(
        () => previewGrades({ ...buildCard(), due: '2026-11-11' }, NOW, 0.9),
        'INVALID_INPUT',
      );
      engineError(
        () => applyReview(buildCard(), 'good', '2026-02-30T00:00:00.000Z', 0.9),
        'INVALID_INSTANT',
      );
    });

    it('refuse des réglages de note incohérents', () => {
      engineError(
        () => gradeReview(input({ settings: { ...SETTINGS, hardFactor: 0 } })),
        'INVALID_PARAM',
        'hardFactor',
      );
      engineError(
        () => gradeReview(input({ settings: { ...SETTINGS, easyFactor: 0 } })),
        'INVALID_PARAM',
        'easyFactor',
      );
      engineError(
        () => gradeReview(input({ settings: { ...SETTINGS, easyFactor: 2 } })),
        'INVALID_PARAM',
        'easyFactor',
      );
      engineError(
        () => gradeReview(input({ format: 'unknown' as BrickFormat })),
        'INVALID_INPUT',
        'format',
      );
      engineError(
        () => gradeReview(input({ selfRating: 'perfect' as FsrsRating })),
        'INVALID_INPUT',
        'selfRating',
      );
      engineError(() => gradeReview(input({ timeMs: -1 })), 'INVALID_INPUT', 'timeMs');
      engineError(
        () => gradeReview(input({ history: null as unknown as TimedResponse[] })),
        'INVALID_INPUT',
        'history',
      );
    });
  });

  describe('propriétés', () => {
    it('est déterministe et ne mute jamais l’historique', () => {
      const arbResponse = fc.record({
        answerId: fc.string({ minLength: 1, maxLength: 8 }),
        timeMs: fc.oneof(fc.constant(null), fc.integer({ min: -10, max: 120_000 })),
        format: fc.constantFrom<BrickFormat>('choice_question', 'cloze', 'recall_card'),
        offset: fc.integer({ min: 0, max: 100 }),
      });
      fc.assert(
        fc.property(fc.array(arbResponse, { maxLength: 80 }), (responses) => {
          const history: TimedResponse[] = responses.map((entry) => ({
            answerId: entry.answerId,
            answeredAt: instantAt(addDays(START, entry.offset), '09:00', 'UTC'),
            format: entry.format,
            timeMs: entry.timeMs,
          }));
          const before = structuredClone(history);
          const first = personalMedianMs(history, 'choice_question', SETTINGS);
          const second = personalMedianMs(history, 'choice_question', SETTINGS);
          expect(second).toBe(first);
          expect(history).toEqual(before);
          expect(recentValidTimes(history, 'choice_question', SETTINGS).length).toBeLessThanOrEqual(
            SETTINGS.medianWindow,
          );
        }),
        FAST_CHECK,
      );
    });

    it('reste entre les temps valides et croît avec le temps de réponse', () => {
      const history = historyOf([12_000, 18_000, 24_000, 30_000, 36_000]);
      const median = personalMedianMs(history, 'choice_question', SETTINGS);
      expect(median).toBeGreaterThanOrEqual(12_000);
      expect(median).toBeLessThanOrEqual(36_000);

      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 120_000 }),
          fc.integer({ min: 0, max: 120_000 }),
          (left, right) => {
            const low = Math.min(left, right);
            const high = Math.max(left, right);
            const lowDecision = gradeReview(input({ correct: true, timeMs: low, history }));
            const highDecision = gradeReview(input({ correct: true, timeMs: high, history }));
            expect(lowDecision.rating).not.toBeNull();
            expect(highDecision.rating).not.toBeNull();
            expect(RATING_RANK[lowDecision.rating ?? 'again']).toBeLessThanOrEqual(
              RATING_RANK[highDecision.rating ?? 'again'],
            );
          },
        ),
        FAST_CHECK,
      );
    });

    it('réserve Again à une réponse fausse et applique une note prévisualisée', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 120_000 }),
          fc.constantFrom(...FSRS_RATINGS),
          (timeMs, rating) => {
            expect(gradeReview(input({ correct: false, timeMs })).rating).toBe('again');
            const card = createNotionCard(NOW, 0.9);
            const preview = previewGrades(card, NOW, 0.9);
            expect(applyReview(card, rating, NOW, 0.9).dueAt).toBe(preview[rating]);
          },
        ),
        FAST_CHECK,
      );
    });
  });
});
