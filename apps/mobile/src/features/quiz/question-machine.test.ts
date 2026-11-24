// Vitest [SPEC-3304] — machine à états de la question (ET-1, CA-1, CA-4; BR-QUI-02, BR-QUI-04).
import { describe, expect, it } from 'vitest';

import type { QuizFeedback, QuizQuestionDto } from '@learny/contracts';

import {
  applyFeedback,
  canCheck,
  failCheck,
  feedbackIsCorrect,
  firstOpenIndex,
  initialStates,
  isEmptyResponse,
  isLastQuestion,
  replaceState,
  selectAnswer,
  startCheck,
  type QuestionState,
} from './question-machine';

function question(position: number, overrides: Partial<QuizQuestionDto> = {}): QuizQuestionDto {
  return {
    position,
    brickVersionId: `00000000-0000-4000-8000-00000000000${String(position)}`,
    type: 'choice_question',
    typeLabel: 'Application',
    notionId: '00000000-0000-4000-8000-0000000000aa',
    notionLabel: 'Chapitre 2',
    payload: { stem: `Question ${String(position)}`, options: [] },
    state: 'unanswered',
    maxScore: 10,
    ...overrides,
  };
}

const feedback: QuizFeedback = {
  isCorrect: true,
  score: 10,
  explanation: 'Bonne réponse.',
  correction: {
    kind: 'choice_question',
    explanation: 'Bonne réponse.',
    options: [{ id: 'a', text: 'A', correct: true, chosen: true }],
  },
};

describe('[SPEC-3304] machine à états de la question', () => {
  it('ouvre une tentative neuve sur la première question', () => {
    const states = initialStates([question(1), question(2)]);
    expect(firstOpenIndex(states)).toBe(0);
    expect(states[0]?.phase).toBe('choosing');
    expect(canCheck(states[0] as QuestionState)).toBe(false);
  });

  it('reprend à la première question sans réponse (CA-4, CL-4)', () => {
    const states = initialStates([
      question(1, { state: 'checked', response: { optionIds: ['a'] }, feedback }),
      question(2, { state: 'checked', response: { optionIds: ['b'] }, feedback }),
      question(3),
      question(4),
    ]);
    expect(states[0]?.phase).toBe('checked');
    expect(states[0]?.feedback).toEqual(feedback);
    expect(firstOpenIndex(states)).toBe(2);
  });

  it('choisit, vérifie et verrouille la réponse (CA-1)', () => {
    const initial = initialStates([question(1)])[0] as QuestionState;
    const selected = selectAnswer(initial, { optionIds: ['b'] });
    expect(canCheck(initial)).toBe(false);
    expect(canCheck(selected)).toBe(true);

    const checking = startCheck(selected);
    expect(checking.phase).toBe('checking');
    // CL-2 — a second press while the check is in flight changes nothing.
    expect(startCheck(checking)).toBe(checking);

    const checked = applyFeedback(checking, feedback);
    expect(checked.phase).toBe('checked');
    expect(feedbackIsCorrect(checked.feedback)).toBe(true);
    // BR-QUI-04 — the answer is not modifiable any more.
    expect(selectAnswer(checked, { optionIds: ['c'] })).toBe(checked);
    expect(canCheck(checked)).toBe(false);
  });

  it('garde la sélection quand la vérification échoue (CL-1)', () => {
    const selected = selectAnswer(initialStates([question(1)])[0] as QuestionState, {
      optionIds: ['b'],
    });
    const failed = failCheck(startCheck(selected));
    expect(failed.phase).toBe('choosing');
    expect(failed.response).toEqual({ optionIds: ['b'] });
    expect(canCheck(failed)).toBe(true);
  });

  it('ne considère vides que les réponses sans contenu', () => {
    expect(isEmptyResponse(null)).toBe(true);
    expect(isEmptyResponse('')).toBe(true);
    expect(isEmptyResponse('  ')).toBe(true);
    expect(isEmptyResponse({})).toBe(true);
    expect(isEmptyResponse({ optionIds: [] })).toBe(true);
    expect(isEmptyResponse({ optionIds: ['a'] })).toBe(false);
    expect(isEmptyResponse({ text: 'Une réponse' })).toBe(false);
    expect(isEmptyResponse({ gaps: { 1: 'universel' } })).toBe(false);
  });

  it('remplace une question et repère la dernière', () => {
    const states = initialStates([question(1), question(2)]);
    const next = replaceState(states, 2, {
      ...(states[1] as QuestionState),
      phase: 'checked',
      feedback,
    });
    expect(next[1]?.phase).toBe('checked');
    expect(next[0]?.phase).toBe('choosing');
    expect(isLastQuestion(states, 0)).toBe(false);
    expect(isLastQuestion(states, 1)).toBe(true);
  });
});
