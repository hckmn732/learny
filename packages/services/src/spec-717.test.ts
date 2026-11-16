import { describe, expect, it } from 'vitest';

import {
  QUESTION_CARD_FORMAT,
  QUESTION_CARD_REASON_CODE,
  QUESTION_CARD_REASON_LABEL,
  questionCardForcedGame,
  type QuestionCardActionLike,
} from './review/question-card';

const NOTION = '22222222-2222-4222-8222-222222222222';
const BRICK = '33333333-3333-4333-8333-333333333333';

function action(overrides: Partial<QuestionCardActionLike> = {}): QuestionCardActionLike {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    automation: 'questions_cartes',
    kind: 'card_created',
    status: 'applied',
    payload: { notionId: NOTION, brickId: BRICK },
    ...overrides,
  };
}

describe('[SPEC-717] règles et calculs — tirage du quiz global', () => {
  it('CA-2 — une carte appliquée impose le format carte de rappel', () => {
    expect(questionCardForcedGame(action())).toEqual({
      notionId: NOTION,
      format: QUESTION_CARD_FORMAT,
      actionId: '11111111-1111-4111-8111-111111111111',
      questionCard: true,
    });
    expect(QUESTION_CARD_REASON_CODE).toBe('question_card');
    expect(QUESTION_CARD_REASON_LABEL).toBe('Votre question');
  });

  it('CA-1, ET-5 — une proposition en attente ne change pas le tirage avant acceptation', () => {
    expect(questionCardForcedGame(action({ status: 'pending_consent' }))).toBeNull();
    expect(questionCardForcedGame(action({ status: 'declined' }))).toBeNull();
    expect(questionCardForcedGame(action({ status: 'consumed' }))).toBeNull();
    expect(
      questionCardForcedGame(action({ payload: { notionId: NOTION, brickId: null } })),
    ).toBeNull();
  });

  it('EF-3 — une action d’une autre automation ou sans notion est ignorée', () => {
    expect(questionCardForcedGame(action({ automation: 'jeu_lacune' }))).toBeNull();
    expect(questionCardForcedGame(action({ payload: { brickId: BRICK } }))).toBeNull();
    expect(
      questionCardForcedGame(action({ payload: { notionId: '', brickId: BRICK } })),
    ).toBeNull();
  });
});
