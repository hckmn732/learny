import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { REFERENCE_NOW } from '@learny/testing/clock';

import { EngineError } from '../errors';
import { stableShuffle } from '../random';
import { parseInstant } from '../time';

import {
  DEFAULT_MASTERY_HALF_LIFE_DAYS,
  DEFAULT_MASTERY_THRESHOLD,
  calculateMastery,
  type MasteryAnswer,
  type MasteryInput,
} from './calculate';

const AT = REFERENCE_NOW;
const FOURTEEN_DAYS_AGO = '2026-10-28T12:20:00.000Z';
const ONE_DAY_AGO = '2026-11-10T12:20:00.000Z';
const AT_MS = parseInstant(AT);
const GENERATED_MIN_MS = parseInstant('2025-01-01T00:00:00.000Z');

function answer(
  score: number,
  answeredAt: string,
  answerId = 'a-1',
  attemptId = `t-${answerId}`,
): MasteryAnswer {
  return { answerId, attemptId, score, answeredAt };
}

function input(
  answers: readonly MasteryAnswer[],
  overrides: Partial<MasteryInput> = {},
): MasteryInput {
  return { answers, at: AT, ...overrides };
}

function invalid(run: () => unknown): EngineError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(EngineError);
    return error as EngineError;
  }
  throw new Error('aucune EngineError levée');
}

function generatedAnswers(): fc.Arbitrary<MasteryAnswer[]> {
  return fc
    .array(
      fc.record({
        score: fc
          .double({ min: 0, max: 1, noNaN: true, noDefaultInfinity: true })
          .map((value) => (Object.is(value, -0) ? 0 : value)),
        answeredAtMs: fc.integer({ min: GENERATED_MIN_MS, max: AT_MS }),
      }),
      { maxLength: 20 },
    )
    .map((rows) =>
      rows.map((row, index) => ({
        answerId: `a-${String(index).padStart(2, '0')}`,
        attemptId: `t-${String(index).padStart(2, '0')}`,
        score: row.score,
        answeredAt: new Date(row.answeredAtMs).toISOString(),
      })),
    );
}

describe('[SPEC-403] Calcul de la maîtrise', () => {
  it('donne 33,333… % si la réussite est l’ancienne réponse et 66,666… % si elle est la récente (CA-1)', () => {
    const oldSuccess = calculateMastery(
      input([answer(1, FOURTEEN_DAYS_AGO, 'a-old'), answer(0, AT, 'a-recent')]),
    );
    expect(oldSuccess.weights.map((weight) => weight.weight)).toEqual([0.5, 1]);
    expect(oldSuccess.mastery).toBeCloseTo(33.333333333333, 10);
    expect(oldSuccess.mastered).toBe(false);

    const recentSuccess = calculateMastery(
      input([answer(0, FOURTEEN_DAYS_AGO, 'a-old'), answer(1, AT, 'a-recent')]),
    );
    expect(recentSuccess.mastery).toBeCloseTo(66.666666666667, 10);
    expect(recentSuccess.mastered).toBe(false);
  });

  it('place exactement une réponse à 80 % au seuil et laisse 79,999 % en dessous (CA-2)', () => {
    const atThreshold = calculateMastery(input([answer(0.8, AT)]));
    expect(atThreshold.threshold).toBe(DEFAULT_MASTERY_THRESHOLD);
    expect(atThreshold.mastery).toBeCloseTo(80, 12);
    expect(atThreshold.mastered).toBe(true);

    const below = calculateMastery(input([answer(0.79999, AT)]));
    expect(below.mastery).toBeLessThan(80);
    expect(below.mastered).toBe(false);

    // The comparison uses the raw double: a threshold slightly above 80 is not reached.
    expect(calculateMastery(input([answer(0.8, AT)], { threshold: 80.0001 })).mastered).toBe(false);
    expect(calculateMastery(input([answer(0.79999, AT)], { threshold: 79 })).mastered).toBe(true);
  });

  it('accepte les bornes de score 0 et 1, sans arrondi intermédiaire (CL-4)', () => {
    const zero = calculateMastery(input([answer(0, AT)]));
    expect(zero.mastery).toBe(0);
    expect(zero.mastered).toBe(false);
    expect(zero.weights[0]?.weight).toBe(1);

    const one = calculateMastery(input([answer(1, AT)]));
    expect(one.mastery).toBe(100);
    expect(one.mastered).toBe(true);

    // A half success contributes exactly half of a full success, on the same date.
    const half = calculateMastery(input([answer(0.5, AT)]));
    expect(half.mastery).toBe(50);
    expect(half.weightedScore).toBe(0.5);
    expect(half.weightSum).toBe(1);
  });

  it('pèse davantage la réponse récente quand les scores sont identiques (CL-2)', () => {
    const result = calculateMastery(
      input([answer(0.5, FOURTEEN_DAYS_AGO, 'a-old'), answer(0.5, AT, 'a-recent')]),
    );
    const old = result.weights.find((weight) => weight.answerId === 'a-old');
    const recent = result.weights.find((weight) => weight.answerId === 'a-recent');
    expect(old?.weight).toBe(0.5);
    expect(recent?.weight).toBe(1);
    expect(recent?.weight ?? 0).toBeGreaterThan(old?.weight ?? 0);
    expect(result.mastery).toBe(50);
  });

  it('retourne 0 %, non maîtrisée, pour une liste vide (CL-1, EF-5)', () => {
    const result = calculateMastery(input([]));
    expect(result).toEqual({
      mastery: 0,
      threshold: 80,
      mastered: false,
      answerCount: 0,
      weightSum: 0,
      weightedScore: 0,
      weights: [],
    });
  });

  it('refuse une réponse future sans poids supérieur à 1 (CL-3)', () => {
    const future = invalid(() => calculateMastery(input([answer(1, '2026-11-11T12:20:00.001Z')])));
    expect(future.code).toBe('INVALID_INPUT');
    expect(future.details?.path).toBe('answers.0.answeredAt');
    expect(future.message).toContain('postérieure');

    // The evaluation instant itself is accepted with the maximum weight of 1.
    expect(calculateMastery(input([answer(1, AT)])).weights[0]?.weight).toBe(1);
  });

  it('refuse un score, un seuil ou une demi-vie hors bornes (EF-3, ET-5)', () => {
    for (const score of [-0.0001, 1.0001, Number.NaN, Number.POSITIVE_INFINITY]) {
      const error = invalid(() => calculateMastery(input([answer(score, AT)])));
      expect(error.code).toBe('INVALID_INPUT');
      expect(error.details?.path).toBe('answers.0.score');
    }
    const negativeZero = invalid(() => calculateMastery(input([answer(-0, AT)])));
    expect(negativeZero.details?.path).toBe('answers.0.score');

    for (const threshold of [-0.1, 100.1, Number.NaN]) {
      const error = invalid(() => calculateMastery(input([answer(1, AT)], { threshold })));
      expect(error.code).toBe('INVALID_INPUT');
      expect(error.details?.path).toBe('threshold');
    }
    for (const halfLifeDays of [0, -14, Number.NaN, Number.POSITIVE_INFINITY]) {
      const error = invalid(() => calculateMastery(input([answer(1, AT)], { halfLifeDays })));
      expect(error.code).toBe('INVALID_INPUT');
      expect(error.details?.path).toBe('halfLifeDays');
    }

    expect(
      invalid(() => calculateMastery({ answers: [], at: '2026-02-30T12:20:00.000Z' })).code,
    ).toBe('INVALID_INPUT');
    expect(
      invalid(() =>
        calculateMastery({ answers: [], at: AT, unknown: true } as unknown as MasteryInput),
      ).code,
    ).toBe('INVALID_INPUT');
  });

  it('est invariant à la permutation et rend le même résultat à chaque appel (CA-3, CL-5)', () => {
    const answers = [
      answer(1, FOURTEEN_DAYS_AGO, 'a-old'),
      answer(0.25, ONE_DAY_AGO, 'a-middle'),
      answer(0.75, AT, 'a-recent'),
    ];
    const reference = calculateMastery(input(answers));
    expect(calculateMastery(input([...answers].reverse()))).toEqual(reference);
    expect(
      calculateMastery(input(stableShuffle(answers, 'SPEC-403', (item) => item.answerId))),
    ).toEqual(reference);
    expect(calculateMastery(input(answers))).toEqual(reference);
  });

  it('ne mute ni l’entrée ni les objets d’entrée (CA-4)', () => {
    const answers = Object.freeze([
      Object.freeze(answer(1, FOURTEEN_DAYS_AGO, 'a-old')),
      Object.freeze(answer(0, AT, 'a-recent')),
    ]);
    const before = JSON.stringify(answers);
    const first = calculateMastery(input(answers));
    const second = calculateMastery(input(answers));
    expect(JSON.stringify(answers)).toBe(before);
    expect(first).toEqual(second);
    expect(answers.map((item) => item.answerId)).toEqual(['a-old', 'a-recent']);
  });

  it('trie le détail par date puis identifiant, quel que soit l’ordre reçu', () => {
    const result = calculateMastery(
      input([
        answer(1, AT, 'a-b'),
        answer(0.5, FOURTEEN_DAYS_AGO, 'a-z'),
        answer(0.5, FOURTEEN_DAYS_AGO, 'a-a'),
        answer(1, AT, 'a-a'),
      ]),
    );
    expect(result.weights.map((weight) => weight.answerId)).toEqual(['a-a', 'a-z', 'a-a', 'a-b']);
    expect(result.answerCount).toBe(4);
  });

  it('retourne 0 sans division par zéro quand tous les poids s’annulent (ET-3)', () => {
    const result = calculateMastery(
      input([answer(1, ONE_DAY_AGO)], { halfLifeDays: Number.MIN_VALUE }),
    );
    expect(result.weightSum).toBe(0);
    expect(result.mastery).toBe(0);
    expect(Number.isNaN(result.mastery)).toBe(false);
    expect(result.mastered).toBe(false);
  });

  it('expose des paramètres par défaut conformes à BR-LAC-01', () => {
    expect(DEFAULT_MASTERY_THRESHOLD).toBe(80);
    expect(DEFAULT_MASTERY_HALF_LIFE_DAYS).toBe(14);
  });

  it('respecte les bornes, la permutation et la monotonie sur des entrées générées (CA-3)', () => {
    fc.assert(
      fc.property(generatedAnswers(), (answers) => {
        const result = calculateMastery(input(answers));
        expect(Number.isFinite(result.mastery)).toBe(true);
        expect(result.mastery).toBeGreaterThanOrEqual(0);
        expect(result.mastery).toBeLessThanOrEqual(100);
        expect(Number.isFinite(result.weightSum)).toBe(true);
        expect(Number.isFinite(result.weightedScore)).toBe(true);
        expect(result.answerCount).toBe(answers.length);
        expect(result.mastered).toBe(answers.length > 0 && result.mastery >= result.threshold);

        expect(calculateMastery(input([...answers].reverse()))).toEqual(result);
        expect(
          calculateMastery(
            input(stableShuffle(answers, 'SPEC-403-generated', (item) => item.answerId)),
          ),
        ).toEqual(result);
      }),
      { seed: 20261111, numRuns: 200 },
    );
  });

  it('ne diminue jamais quand un score augmente à date égale (CA-3)', () => {
    fc.assert(
      fc.property(generatedAnswers(), (answers) => {
        fc.pre(answers.length > 0);
        const first = answers[0];
        if (first === undefined) return;
        const raisedScore = first.score === 1 ? first.score : first.score + (1 - first.score) / 2;
        const raised = [{ ...first, score: raisedScore }, ...answers.slice(1)];
        expect(calculateMastery(input(raised)).mastery).toBeGreaterThanOrEqual(
          calculateMastery(input(answers)).mastery,
        );
      }),
      { seed: 20261111, numRuns: 200 },
    );
  });
});
