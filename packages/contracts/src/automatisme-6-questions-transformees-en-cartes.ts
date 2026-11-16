import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { AutomationActionKind, AutomationKey } from './moteur-d-automatismes';

// Contract of the sixth automation (SPEC-717, BR-AUT-06, ADR-0190, ADR-0193).
//
// A learner question consumed from `tutor/question-asked` becomes one `recall_card` brick. In the
// default `confirm` mode the journal row waits in `pending_consent`; the learner accepts it from
// the home banner or refuses it. In `auto` mode the row is applied immediately. The dedupe key
// freezes the pair (conversation, notion) so a repeated question never creates a second card.

export const QUESTIONS_CARTES_AUTOMATION = 'questions_cartes' as const satisfies AutomationKey;
export const QUESTIONS_CARTES_ACTION_KINDS = ['card_created'] as const;
export const QuestionsCartesActionKind = z.enum(QUESTIONS_CARTES_ACTION_KINDS);
export type QuestionsCartesActionKind = z.infer<typeof QuestionsCartesActionKind>;

/** EF-1 — the source of a card: the conversation, the question and the verified answer. */
export const QuestionCardPayload = z.object({
  dedupeKey: z.string().min(1).max(200),
  conversationId: Uuid,
  questionMessageId: Uuid,
  tutorMessageId: Uuid,
  courseId: Uuid,
  chapterId: Uuid,
  notionId: Uuid,
  notionLabel: z.string().min(1).max(200),
  question: z.string().min(3).max(300),
  answer: z.string().min(1).max(600),
  sourceLabel: z.string().min(1).max(120),
  mode: z.enum(['confirm', 'auto']),
  brickId: Uuid.nullable(),
});
export type QuestionCardPayload = z.infer<typeof QuestionCardPayload>;

/** One proposal of the banner, projected from the journal row of SPEC-711. */
export const QuestionCardProposal = z.object({
  id: Uuid,
  kind: AutomationActionKind,
  status: z.enum(['pending_consent', 'applied', 'declined', 'undone', 'consumed']),
  summary: z.string().min(1),
  notionLabel: z.string().min(1),
  question: z.string().min(1),
  answer: z.string().min(1),
  createdAt: IsoDateTime,
  decidedAt: IsoDateTime.nullable(),
});
export type QuestionCardProposal = z.infer<typeof QuestionCardProposal>;

/** CL-3 — the deterministic reasons a verified tutor answer cannot become a card. */
export const QUESTION_CARD_SKIP_REASONS = [
  'missing_question',
  'missing_answer',
  'missing_notion',
  'unknown_notion',
  'reported_source',
] as const;
export const QuestionCardSkipReason = z.enum(QUESTION_CARD_SKIP_REASONS);
export type QuestionCardSkipReason = z.infer<typeof QuestionCardSkipReason>;
