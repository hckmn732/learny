import { describe, expect, it } from 'vitest';

import { NOTION_A, NOTION_B, NOTION_C } from '../example-ids';

import { gradeChoiceQuestion } from './grade';
import type { ChoiceQuestionPayload } from './schema';

function single(): ChoiceQuestionPayload {
  return {
    stem: 'Quel compte augmente au débit ?',
    mode: 'single',
    options: [
      { id: 'a', text: 'La banque', correct: true, notionId: NOTION_A },
      { id: 'b', text: 'Le capital', correct: false, notionId: NOTION_B },
      { id: 'c', text: 'Le résultat', correct: false, notionId: NOTION_C },
    ],
    explanation: 'La banque augmente au débit lors d’un encaissement.',
    objective: 'Distinguer actif et passif',
    sources: [],
  };
}

function multiple(): ChoiceQuestionPayload {
  return {
    stem: 'Quels comptes sont des actifs ?',
    mode: 'multiple',
    options: [
      { id: 'a', text: 'Banque', correct: true, notionId: NOTION_A },
      { id: 'b', text: 'Stock', correct: true, notionId: NOTION_B },
      { id: 'c', text: 'Capital', correct: false, notionId: NOTION_C },
      { id: 'd', text: 'Emprunt', correct: false, notionId: NOTION_B },
    ],
    explanation: 'La banque et le stock sont des emplois de l’entreprise.',
    objective: 'Reconnaître un actif',
    sources: [],
  };
}

function scoreOf(response: unknown, payload = single()) {
  const graded = gradeChoiceQuestion(payload, response);
  if (!graded.ok) throw new Error(graded.error.issues.map((issue) => issue.message).join(' '));
  return graded.value;
}

describe('[SPEC-502] correction d’une question à choix', () => {
  const cases: Array<{
    name: string;
    payload: ChoiceQuestionPayload;
    response: unknown;
    isCorrect: boolean;
    score: number;
    distractor: string | null;
  }> = [
    {
      name: 'unique juste',
      payload: single(),
      response: { optionIds: ['a'] },
      isCorrect: true,
      score: 1,
      distractor: null,
    },
    {
      name: 'unique faux (premier distracteur)',
      payload: single(),
      response: { optionIds: ['b'] },
      isCorrect: false,
      score: 0,
      distractor: NOTION_B,
    },
    {
      name: 'unique faux (second distracteur)',
      payload: single(),
      response: { optionIds: ['c'] },
      isCorrect: false,
      score: 0,
      distractor: NOTION_C,
    },
    {
      name: 'multiple exact',
      payload: multiple(),
      response: { optionIds: ['b', 'a'] },
      isCorrect: true,
      score: 1,
      distractor: null,
    },
    {
      name: 'multiple partiel',
      payload: multiple(),
      response: { optionIds: ['a'] },
      isCorrect: false,
      score: 0.5,
      distractor: null,
    },
    {
      name: 'multiple avec un faux (pénalité nulle)',
      payload: multiple(),
      response: { optionIds: ['a', 'c'] },
      isCorrect: false,
      score: 0,
      distractor: NOTION_C,
    },
    {
      name: 'multiple avec deux faux (plancher zéro)',
      payload: multiple(),
      response: { optionIds: ['c', 'd'] },
      isCorrect: false,
      score: 0,
      distractor: NOTION_C,
    },
    {
      name: 'multiple deux justes et un faux',
      payload: multiple(),
      response: { optionIds: ['a', 'b', 'c'] },
      isCorrect: false,
      score: 0.5,
      distractor: NOTION_C,
    },
    {
      name: 'multiple tous les choix',
      payload: multiple(),
      response: { optionIds: ['a', 'b', 'c', 'd'] },
      isCorrect: false,
      score: 0,
      distractor: NOTION_C,
    },
  ];

  it.each(cases)('$name', ({ payload, response, isCorrect, score, distractor }) => {
    const graded = scoreOf(response, payload);
    expect(graded.isCorrect).toBe(isCorrect);
    expect(graded.score).toBe(score);
    expect(graded.chosenDistractorNotionId).toBe(distractor);
    expect(graded.feedbackTitle).toBe(isCorrect ? 'Exact.' : 'Pas tout à fait.');
    expect(graded.correction.kind).toBe('choice_question');
  });

  it('arrondit un score multiple au dix-millième (3 justes, 1 juste choisi)', () => {
    const payload = multiple();
    payload.options.push({
      id: 'e',
      text: 'Terrain',
      correct: true,
      notionId: NOTION_A,
    });
    const graded = scoreOf({ optionIds: ['a'] }, payload);
    expect(graded.score).toBe(0.3333);
    expect(graded.isCorrect).toBe(false);
  });

  it('expose l’état de chaque option dans la correction (EF-1)', () => {
    const graded = scoreOf({ optionIds: ['a', 'c'] }, multiple());
    expect(graded.correction).toMatchObject({
      kind: 'choice_question',
      explanation: 'La banque et le stock sont des emplois de l’entreprise.',
      options: [
        { id: 'a', correct: true, chosen: true },
        { id: 'b', correct: true, chosen: false },
        { id: 'c', correct: false, chosen: true },
        { id: 'd', correct: false, chosen: false },
      ],
    });
  });

  it('refuse une réponse vide (CL-1)', () => {
    const graded = gradeChoiceQuestion(single(), { optionIds: [] });
    expect(graded.ok).toBe(false);
    if (!graded.ok) {
      expect(graded.error.code).toBe('RESPONSE_INVALID');
      expect(graded.error.issues[0]?.path).toBe('response.optionIds');
    }
  });

  it('refuse deux options en mode unique (CL-2)', () => {
    const graded = gradeChoiceQuestion(single(), { optionIds: ['a', 'b'] });
    expect(graded.ok).toBe(false);
    if (!graded.ok) expect(graded.error.code).toBe('RESPONSE_INVALID');
  });

  it('refuse un identifiant inconnu et un doublon', () => {
    for (const response of [{ optionIds: ['z'] }, { optionIds: ['a', 'a'] }]) {
      const graded = gradeChoiceQuestion(multiple(), response);
      expect(graded.ok).toBe(false);
      if (!graded.ok) expect(graded.error.code).toBe('RESPONSE_INVALID');
    }
  });

  it('normalise la réponse par les ids triés (ADR-0024)', () => {
    expect(scoreOf({ optionIds: ['b', 'a'] }, multiple()).normalizedResponse).toBe('a,b');
  });
});
