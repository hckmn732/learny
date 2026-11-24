// Vitest [SPEC-3304] — segments de progression et rapport de correction (EF-2, CA-2, ET-3).
import { describe, expect, it } from 'vitest';

import type { QuizFeedback } from '@learny/contracts';

import { isPendingCorrection, toCorrectionView } from './correction-view';
import { correctedCount, correctCount, progressSegments } from './progress-segments';
import type { QuestionState } from './question-machine';

function state(
  position: number,
  phase: QuestionState['phase'],
  feedback: QuizFeedback | null = null,
): QuestionState {
  return { position, phase, response: { optionIds: ['a'] }, feedback };
}

const correct: QuizFeedback = {
  isCorrect: true,
  score: 100,
  explanation: 'Exact.',
  correction: {
    kind: 'choice_question',
    explanation: 'Exact.',
    options: [{ id: 'a', text: 'A', correct: true, chosen: true }],
  },
};
const wrong: QuizFeedback = {
  isCorrect: false,
  score: 0,
  explanation: 'Pas tout à fait.',
  correction: {
    kind: 'choice_question',
    explanation: 'Pas tout à fait.',
    options: [
      { id: 'a', text: 'A', correct: false, chosen: true },
      { id: 'b', text: 'B', correct: true, chosen: false },
    ],
  },
};
const pending: QuizFeedback = {
  isCorrect: null,
  score: null,
  explanation: null,
  pending: true,
};

describe('[SPEC-3304] segments de progression', () => {
  it('colore les questions corrigées et la question courante (EF-2)', () => {
    const states = [
      state(1, 'checked', correct),
      state(2, 'checked', wrong),
      state(3, 'choosing'),
      state(4, 'choosing'),
    ];
    expect(progressSegments(states, 2)).toEqual(['correct', 'wrong', 'current', 'upcoming']);
  });

  it('laisse neutre une réponse ouverte en attente du tuteur', () => {
    expect(progressSegments([state(1, 'checked', pending)], 0)).toEqual(['pending']);
    expect(correctedCount([state(1, 'checked', pending)])).toBe(1);
    expect(correctCount([state(1, 'checked', pending)])).toBe(0);
  });

  it('compte les corrections et les bonnes réponses sans calculer de score', () => {
    const states = [
      state(1, 'checked', correct),
      state(2, 'checked', correct),
      state(3, 'choosing'),
    ];
    expect(correctedCount(states)).toBe(2);
    expect(correctCount(states)).toBe(2);
  });
});

describe('[SPEC-3304] rapport de correction', () => {
  it('adapte une correction à choix au rendu des briques', () => {
    const view = toCorrectionView(wrong);
    expect(view).toEqual({
      kind: 'choice_question',
      explanation: 'Pas tout à fait.',
      options: [
        { id: 'a', text: 'A', correct: false, chosen: true },
        { id: 'b', text: 'B', correct: true, chosen: false },
      ],
    });
  });

  it('adapte un texte à trous et une association', () => {
    expect(
      toCorrectionView({
        isCorrect: true,
        score: 100,
        explanation: 'Exact.',
        correction: {
          kind: 'cloze',
          explanation: 'Exact.',
          gaps: [{ id: 1, given: 'universel', expected: 'universel', correct: true }],
        },
      }),
    ).toMatchObject({ kind: 'cloze', gaps: [{ id: 1, correct: true }] });
    expect(
      toCorrectionView({
        isCorrect: false,
        score: 0,
        explanation: 'Pas tout à fait.',
        correction: {
          kind: 'matching',
          explanation: 'Pas tout à fait.',
          pairs: [
            {
              pairId: 'k40',
              left: 'Clé 40',
              expectedRight: 'Débit',
              givenRight: 'Crédit',
              correct: false,
            },
          ],
        },
      }),
    ).toMatchObject({ kind: 'matching', pairs: [{ pairId: 'k40', correct: false }] });
  });

  it('ne fabrique aucune correction sans réponse du serveur (ET-3)', () => {
    expect(toCorrectionView(null)).toBeUndefined();
    expect(toCorrectionView({ isCorrect: null, score: null, explanation: null })).toBeUndefined();
    expect(isPendingCorrection(pending)).toBe(true);
    expect(isPendingCorrection(correct)).toBe(false);
  });
});
