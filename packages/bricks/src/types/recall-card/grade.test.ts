import { describe, expect, it } from 'vitest';

import { gradeRecallCard } from './grade';
import type { RecallCardPayload } from './schema';

const payload: RecallCardPayload = {
  front: 'Que signifie la partie double ?',
  back: 'Chaque opération est enregistrée au débit d’un compte et au crédit d’un autre.',
  sourceLabel: 'Guide FI, p. 4',
  mnemonic: '« Un débit, un crédit, même montant. »',
  sources: [],
};

describe('[SPEC-502] correction d’une carte de rappel', () => {
  const cases = [
    { selfGrade: 'again', isCorrect: false, score: 0 },
    { selfGrade: 'hard', isCorrect: true, score: 1 },
    { selfGrade: 'good', isCorrect: true, score: 1 },
    { selfGrade: 'easy', isCorrect: true, score: 1 },
  ] as const;

  it.each(cases)('auto-évaluation $selfGrade', ({ selfGrade, isCorrect, score }) => {
    const graded = gradeRecallCard(payload, { selfGrade });
    expect(graded.ok).toBe(true);
    if (!graded.ok) return;
    expect(graded.value.isCorrect).toBe(isCorrect);
    expect(graded.value.score).toBe(score);
    expect(graded.value.normalizedResponse).toBe(selfGrade);
    expect(graded.value.feedbackTitle).toBe(isCorrect ? 'Exact.' : 'Pas tout à fait.');
    expect(graded.value.correction).toMatchObject({
      kind: 'recall_card',
      front: payload.front,
      back: payload.back,
      selfGrade,
      fsrsGrade: selfGrade,
      correct: isCorrect,
    });
  });

  it('refuse une auto-évaluation inconnue', () => {
    const graded = gradeRecallCard(payload, { selfGrade: 'perfect' });
    expect(graded.ok).toBe(false);
    if (!graded.ok) expect(graded.error.code).toBe('RESPONSE_INVALID');
  });

  it('refuse une réponse sans auto-évaluation', () => {
    const graded = gradeRecallCard(payload, {});
    expect(graded.ok).toBe(false);
  });
});
