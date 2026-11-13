import { describe, expect, it } from 'vitest';

import { computeScore, isPassed } from './score';

const QUESTION = 100 / 12;

function answer(position: number, notionId: string, ratio: number, correct: boolean) {
  return {
    position,
    notionId,
    score: ratio * QUESTION,
    maxScore: QUESTION,
    isCorrect: correct,
  };
}

describe('[SPEC-611] score du quiz de validation', () => {
  it('CA-5 — 8 justes sur 9 auto + 2 ouvertes à 1 et 0,5 + 1 à 0 donnent 79,17', () => {
    const answers = [
      ...Array.from({ length: 9 }, (_, index) =>
        answer(index + 1, `notion-${String(index + 1)}`, index < 8 ? 1 : 0, index < 8),
      ),
      answer(10, 'notion-open-1', 1, true),
      answer(11, 'notion-open-2', 0.5, false),
      answer(12, 'notion-open-3', 0, false),
    ];
    const result = computeScore(answers);
    expect(result.score).toBe(79.17);
    expect(result.perNotion['notion-open-2']).toEqual({ correct: 0, total: 1, score: 50 });
  });

  it('CA-6 — un seuil de 85 refuse un score de 84 et accepte 85', () => {
    expect(isPassed(84, 85)).toBe(false);
    expect(isPassed(85, 85)).toBe(true);
    expect(isPassed(84.99, 85)).toBe(false);
  });

  it('borne les points partiels et ignore une question sans barème', () => {
    const result = computeScore([
      { position: 1, notionId: 'n1', score: 12, maxScore: 10, isCorrect: true },
      { position: 2, notionId: 'n2', score: 0, maxScore: 0, isCorrect: null },
    ]);
    expect(result.score).toBe(100);
    expect(result.perNotion['n1']).toEqual({ correct: 1, total: 1, score: 100 });
    expect(result.perNotion['n2']).toEqual({ correct: 0, total: 1, score: 0 });
  });

  it('produit un score vide sans réponse', () => {
    expect(computeScore([])).toEqual({ score: 0, perNotion: {} });
  });
});
