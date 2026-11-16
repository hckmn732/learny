// SPEC-717, ADR-0193 §4 — an applied `card_created` action of `questions_cartes` imposes the
// `recall_card` format on its notion in the next global quiz. The pure projection keeps the
// decision testable without a database; the session service only merges it with the gap games of
// SPEC-716 (a gap format has priority over a question card, ADR-0193 §1).
export const QUESTION_CARD_AUTOMATION = 'questions_cartes' as const;
export const QUESTION_CARD_KIND = 'card_created' as const;
export const QUESTION_CARD_FORMAT = 'recall_card' as const;
export const QUESTION_CARD_REASON_CODE = 'question_card' as const;
export const QUESTION_CARD_REASON_LABEL = 'Votre question';

export interface QuestionCardActionLike {
  id: string;
  automation: string;
  kind: string;
  status: string;
  payload: Record<string, unknown>;
}

export interface QuestionCardForcedGame {
  notionId: string;
  format: typeof QUESTION_CARD_FORMAT;
  actionId: string;
  questionCard: true;
}

/**
 * Only an applied action whose brick was really created imposes the card. A pending proposal, a
 * declined/undone/consumed action or a missing `brickId` has no effect on the draw (ET-5).
 */
export function questionCardForcedGame(
  action: QuestionCardActionLike,
): QuestionCardForcedGame | null {
  if (action.automation !== QUESTION_CARD_AUTOMATION) return null;
  if (action.kind !== QUESTION_CARD_KIND || action.status !== 'applied') return null;
  const notionId = action.payload.notionId;
  const brickId = action.payload.brickId;
  if (typeof notionId !== 'string' || notionId === '') return null;
  if (typeof brickId !== 'string' || brickId === '') return null;
  return {
    notionId,
    format: QUESTION_CARD_FORMAT,
    actionId: action.id,
    questionCard: true,
  };
}
