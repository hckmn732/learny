import { describe, expect, it } from 'vitest';

import { quizAttemptSeed, validationQuizSize } from './start';

describe('[SPEC-611] préparation d’une tentative', () => {
  it('CA-1 — 11 notions donnent 12 questions, 25 notions sont plafonnées à 20', () => {
    expect(validationQuizSize(11)).toBe(12);
    expect(validationQuizSize(12)).toBe(12);
    expect(validationQuizSize(25)).toBe(20);
    expect(validationQuizSize(6)).toBe(12);
  });

  it('CA-2 — la graine dépend du module, de l’apprenant et du numéro de tentative', () => {
    const first = quizAttemptSeed('user-1', 'module-1', 1);
    expect(first).toMatch(/^[0-9a-f]{64}$/);
    expect(quizAttemptSeed('user-1', 'module-1', 1)).toBe(first);
    expect(quizAttemptSeed('user-1', 'module-1', 2)).not.toBe(first);
    expect(quizAttemptSeed('user-2', 'module-1', 1)).not.toBe(first);
  });
});
