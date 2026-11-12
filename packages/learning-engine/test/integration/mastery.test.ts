import { describe, expect, it } from 'vitest';

import { ENGINE } from '@learny/config/product';
import {
  DEFAULT_MASTERY_HALF_LIFE_DAYS,
  DEFAULT_MASTERY_THRESHOLD,
  calculateMastery,
  type AnswerRecord,
  type MasteryAnswer,
} from '@learny/learning-engine';
import { REFERENCE_NOW } from '@learny/learning-engine/fixtures';
import { buildAnswer } from '@learny/learning-engine/fixtures/builders';

const FOURTEEN_DAYS_AGO = '2026-10-28T12:20:00.000Z';

/** The service projects a stored answer onto the narrow mastery contract. */
function fromRecord(record: AnswerRecord): MasteryAnswer {
  if (record.score === null || record.maxScore === null || record.maxScore <= 0) {
    throw new Error('réponse non notée');
  }
  return {
    answerId: record.answerId,
    attemptId: record.attemptId,
    score: record.score / record.maxScore,
    answeredAt: record.answeredAt,
  };
}

function recordedAnswer(
  answerId: string,
  attemptId: string,
  score: number,
  maxScore: number,
  answeredAt: string,
): AnswerRecord {
  return buildAnswer({ answerId, attemptId, score, maxScore, answeredAt });
}

function compute(answers: readonly MasteryAnswer[]) {
  return calculateMastery({
    answers,
    at: REFERENCE_NOW,
    threshold: ENGINE.mastery.threshold,
    halfLifeDays: ENGINE.mastery.halfLifeDays,
  });
}

describe('[SPEC-403] composition', () => {
  it('compose les réponses du moteur et les paramètres de configuration (CA-1, CA-2)', () => {
    expect(DEFAULT_MASTERY_THRESHOLD).toBe(ENGINE.mastery.threshold);
    expect(DEFAULT_MASTERY_HALF_LIFE_DAYS).toBe(ENGINE.mastery.halfLifeDays);

    const answers = [
      fromRecord(recordedAnswer('a-old', 't-old', 1, 1, FOURTEEN_DAYS_AGO)),
      fromRecord(recordedAnswer('a-recent', 't-recent', 0, 1, REFERENCE_NOW)),
    ];
    const result = compute(answers);
    expect(result.threshold).toBe(80);
    expect(result.mastery).toBeCloseTo(100 / 3, 10);
    expect(result.mastered).toBe(false);

    // 20/25 = 0.8 exactly reaches the configured 80 % threshold.
    const atThreshold = compute([
      fromRecord(recordedAnswer('a-20', 't-20', 20, 25, REFERENCE_NOW)),
    ]);
    expect(atThreshold.mastery).toBeCloseTo(80, 12);
    expect(atThreshold.mastered).toBe(true);

    const below = compute([fromRecord(recordedAnswer('a-19', 't-19', 19.999, 25, REFERENCE_NOW))]);
    expect(below.mastery).toBeLessThan(80);
    expect(below.mastered).toBe(false);
  });

  it('reste identique à la répétition et ne dépend pas de l’ordre de composition (CA-3, CA-4)', () => {
    const answers = [
      fromRecord(recordedAnswer('a-old', 't-old', 1, 1, FOURTEEN_DAYS_AGO)),
      fromRecord(recordedAnswer('a-mid', 't-mid', 2, 4, '2026-11-10T12:20:00.000Z')),
      fromRecord(recordedAnswer('a-recent', 't-recent', 3, 4, REFERENCE_NOW)),
    ];
    const first = compute(answers);
    const frozen = JSON.stringify(answers);
    expect(compute(answers)).toEqual(first);
    expect(compute([...answers].reverse())).toEqual(first);
    expect(JSON.stringify(answers)).toBe(frozen);
    expect(first.mastery).toBeGreaterThanOrEqual(0);
    expect(first.mastery).toBeLessThanOrEqual(100);
  });

  it('traite l’historique vide et la réponse future selon les contrats (CA-4)', () => {
    expect(compute([])).toMatchObject({
      mastery: 0,
      mastered: false,
      answerCount: 0,
      weightSum: 0,
      weightedScore: 0,
      weights: [],
    });

    const future = fromRecord(
      recordedAnswer('a-future', 't-future', 1, 1, '2026-11-11T12:20:00.001Z'),
    );
    expect(() => compute([future])).toThrow(
      expect.objectContaining({
        code: 'INVALID_INPUT',
        details: { path: 'answers.0.answeredAt' },
      }),
    );
  });
});
