import { z } from 'zod';

import { ENGINE } from '@learny/config/product';
import type { DbTx } from '@learny/db';
import type {
  AnswerRecord,
  FsrsRating,
  MasteryAnswer,
  ReviewSource,
  SerializedFsrsCard,
  TimedResponse,
} from '@learny/learning-engine';

import {
  answerRecordOf,
  formatOf,
  loadHistory,
  loadStates,
  loadTimedHistory,
  persistStep,
  planNotionReviews,
  previousStateOf,
  scoreValue,
} from './apply-result';

// Single review application of the daily quiz (SPEC-701 ET-3, ET-4; BR-MEM-02). One transaction
// step: the caller already inserted the `answers` row, this function feeds the pure engine with
// the one notion and persists the FSRS outcome (journal tables via the security-definer
// functions). A skipped answer never reaches this function (no FSRS update, CL-6).

export interface ApplyReviewResultInput {
  userId: string;
  notionId: string;
  source: ReviewSource | (string & {});
  format: string;
  /** Item-level correctness; `null` only for an incomplete response (no card update). */
  correct: boolean | null;
  /** Self-assessment of a recall card; the automatic grade is used when `null`. */
  rating: FsrsRating | null;
  timeMs: number;
  answerId: string;
  attemptId: string;
  attemptNo: number;
  reviewedAt: string;
}

export interface AppliedReviewResult {
  rating: FsrsRating;
  dueAt: string;
  cardAfter: SerializedFsrsCard;
}

const inputSchema = z.object({
  userId: z.uuid(),
  notionId: z.uuid(),
  source: z.string(),
  format: z.string(),
  correct: z.boolean().nullable(),
  rating: z.enum(['again', 'hard', 'good', 'easy']).nullable(),
  timeMs: z.number().int().min(0).max(3_600_000),
  answerId: z.uuid(),
  attemptId: z.uuid(),
  attemptNo: z.number().int().min(1),
  reviewedAt: z.iso.datetime(),
});

/**
 * ET-3, ET-4 — applies one answer of one notion: FSRS grade (self-assessment for a recall card,
 * correctness and personal median otherwise), mastery, gap lifecycle and the `review_logs` row.
 * The state row is locked; a replay with the same `(answerId, notionId)` writes nothing.
 */
export async function applyReviewResult(
  tx: DbTx,
  rawInput: ApplyReviewResultInput,
): Promise<AppliedReviewResult | null> {
  const input = inputSchema.parse(rawInput);
  const format = formatOf(input.format);
  if (format === null) return null;

  const states = await loadStates(tx, input.userId, [input.notionId]);
  const state = states.get(input.notionId);
  if (state === undefined) {
    // A notion of the session always has a state (it was due); an absent row is a defect.
    return null;
  }
  const rows = await loadHistory(tx, input.userId, input.notionId);
  const gapAnswers: AnswerRecord[] = [];
  for (const row of rows) {
    const record = answerRecordOf(row);
    if (record !== null) gapAnswers.push(record);
  }
  const masteryHistory: MasteryAnswer[] = rows.map((row) => ({
    answerId: row.answer_id,
    attemptId: row.attempt_id,
    score: scoreValue(row.score, row.max_score, row.is_correct),
    answeredAt: new Date(row.answered_at).toISOString(),
  }));
  const timed: TimedResponse[] = await loadTimedHistory(tx, input.userId);

  const correct = input.correct === null ? false : input.correct;
  const plan = planNotionReviews(
    {
      notionId: input.notionId,
      state: previousStateOf(state),
      answers: [
        {
          answerId: input.answerId,
          attemptId: input.attemptId,
          attemptKind: 'global_quiz_session' as const,
          attemptNo: input.attemptNo,
          source: input.source as ReviewSource,
          notionId: input.notionId,
          format,
          correct,
          selfRating: input.rating,
          timeMs: input.timeMs,
          answeredAt: input.reviewedAt,
          chosenDistractorNotionId: null,
          confusedWithNotionId: null,
          normalizedResponse: null,
          offTopic: false,
          countsForGaps: true,
        },
      ],
      history: { mastery: masteryHistory, gapAnswers, timed },
    },
    {
      fsrs: ENGINE.fsrs,
      gaps: { ...ENGINE.gaps, masteryThreshold: ENGINE.mastery.threshold },
      masteryThreshold: ENGINE.mastery.threshold,
      masteryHalfLifeDays: ENGINE.mastery.halfLifeDays,
    },
  );
  let applied: AppliedReviewResult | null = null;
  for (const step of plan) {
    await persistStep(tx, input.userId, step);
    applied = { rating: step.rating, dueAt: step.dueAt, cardAfter: step.cardAfter };
  }
  return applied;
}
