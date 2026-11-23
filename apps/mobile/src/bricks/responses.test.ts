// Vitest [SPEC-3301] — responses of the auto-corrected bricks (CA-2, BR-BRI-08).
import { describe, expect, it } from 'vitest';

import type { AutoGradedType, BrickPayload } from '@learny/bricks';
import { AUTO_GRADED_TYPES, brickExamples, gradeBrick, opaqueMapping } from '@learny/bricks';

import {
  categorizationResponse,
  choiceResponse,
  clozeResponse,
  isValidResponse,
  localGrade,
  matchingPairs,
  matchingResponse,
  orderingIds,
  orderingResponse,
  recallResponse,
  recallSelfGrade,
  selectedOptionIds,
  toggleChoiceOption,
} from './responses';
import { correctResponseFor } from './showcase';

const SEED = '00000000-0000-4000-8000-000000003301';

function payloadOf(type: AutoGradedType): unknown {
  return brickExamples[type].valid;
}

describe('[SPEC-3301] réponses des briques corrigées par le code', () => {
  it('[SPEC-3301] chaque réponse produite est acceptée par le schéma de @learny/bricks (CA-2)', () => {
    const samples: Record<AutoGradedType, unknown> = {
      choice_question: choiceResponse(['a']),
      cloze: clozeResponse({ '1': 'débit' }),
      matching: matchingResponse({ l1: 'r2' }),
      ordering: orderingResponse(['i1', 'i2']),
      categorization: categorizationResponse({ i1: 'c1' }),
      recall_card: recallResponse('good'),
    };
    for (const type of AUTO_GRADED_TYPES) {
      expect(isValidResponse(type, samples[type]), type).toBe(true);
    }
  });

  it('[SPEC-3301] refuse une réponse hors du schéma', () => {
    expect(isValidResponse('choice_question', { optionIds: [] })).toBe(false);
    expect(isValidResponse('matching', { pairs: 1 })).toBe(false);
    expect(isValidResponse('recall_card', { selfGrade: 'parfait' })).toBe(false);
  });

  it('[SPEC-3301] la bonne réponse de chaque exemple est juste pour gradeBrick (CA-2)', () => {
    for (const type of AUTO_GRADED_TYPES) {
      const payload = payloadOf(type);
      const response = correctResponseFor(type, payload, SEED);
      expect(isValidResponse(type, response), type).toBe(true);
      const outcome = gradeBrick(type, payload as BrickPayload<AutoGradedType>, response, SEED);
      expect(outcome.ok, type).toBe(true);
      if (outcome.ok) expect(outcome.value.isCorrect, type).toBe(true);
    }
  });

  it('[SPEC-3301] `localGrade` renvoie la même justesse que `gradeBrick` (BR-BRI-08)', () => {
    for (const type of AUTO_GRADED_TYPES) {
      const payload = payloadOf(type);
      const response = correctResponseFor(type, payload, SEED);
      const direct = gradeBrick(type, payload as BrickPayload<AutoGradedType>, response, SEED);
      const local = localGrade(type, payload, response, SEED);
      expect(direct.ok && local.ok).toBe(true);
      if (direct.ok && local.ok) {
        expect(local.value.isCorrect).toBe(direct.value.isCorrect);
        expect(local.value.correction.kind).toBe(direct.value.correction.kind);
      }
    }
  });

  it('[SPEC-3301] une réponse fausse est corrigée comme fausse (BR-MEM-10)', () => {
    const choice = brickExamples.choice_question.valid;
    const wrongId = choice.options.find((option) => !option.correct)?.id ?? '';
    const outcome = gradeBrick('choice_question', choice, choiceResponse([wrongId]), SEED);
    expect(outcome.ok && outcome.value.isCorrect).toBe(false);
  });

  it('[SPEC-3301] la sélection simple remplace, la multiple bascule (EF-2)', () => {
    expect(toggleChoiceOption('single', ['a'], 'b')).toEqual(['b']);
    expect(toggleChoiceOption('single', ['a'], 'a')).toEqual([]);
    expect(toggleChoiceOption('multiple', ['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleChoiceOption('multiple', ['a', 'b'], 'a')).toEqual(['b']);
  });

  it('[SPEC-3301] les lecteurs de réponse tolèrent une réponse absente', () => {
    expect(selectedOptionIds(undefined)).toEqual([]);
    expect(orderingIds(null)).toEqual([]);
    expect(matchingPairs(undefined)).toEqual({});
    expect(recallSelfGrade({ selfGrade: 'bon' })).toBeNull();
    expect(recallSelfGrade({ selfGrade: 'easy' })).toBe('easy');
  });

  it('[SPEC-3301] l’association garde les identifiants opaques du serveur (ET-2)', () => {
    const mapping = opaqueMapping(brickExamples.matching.valid, SEED);
    const pairs: Record<string, string | null> = {};
    for (const right of mapping) {
      if (right.pairId !== null) pairs[right.pairId] = right.id;
    }
    expect(Object.keys(matchingPairs(matchingResponse(pairs)))).toEqual(Object.keys(pairs));
  });
});
