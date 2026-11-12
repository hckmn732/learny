import { describe, expect, it } from 'vitest';

import type { AnswerRecord, GapState } from '@learny/learning-engine';

import {
  fromPersistenceCard,
  planNotionReviews,
  reviewKey,
  selectCorrectedAnswers,
  toPersistenceCard,
  unappliedCandidates,
  type NotionReviewAnswer,
  type NotionReviewHistory,
  type PreviousNotionState,
  type ReviewAnswerInput,
} from './apply-result';

const NOTION = 'n-411';
const ATTEMPT = 'a-411';
const FIRST = '2026-11-11T10:00:00.000Z';
const SECOND = '2026-11-11T10:05:00.000Z';

function answerInput(
  partial: Partial<ReviewAnswerInput> & Pick<ReviewAnswerInput, 'answerId'>,
): ReviewAnswerInput {
  return {
    position: 1,
    notionIds: [NOTION],
    format: 'choice_question',
    isCorrect: true,
    selfRating: null,
    ...partial,
  };
}

function reviewAnswer(
  partial: Partial<NotionReviewAnswer> & Pick<NotionReviewAnswer, 'answerId' | 'answeredAt'>,
): NotionReviewAnswer {
  return {
    attemptId: ATTEMPT,
    attemptKind: 'validation_quiz',
    attemptNo: 1,
    source: 'validation',
    notionId: NOTION,
    format: 'choice_question',
    correct: true,
    timeMs: 5000,
    selfRating: null,
    chosenDistractorNotionId: null,
    confusedWithNotionId: null,
    normalizedResponse: null,
    offTopic: false,
    countsForGaps: true,
    ...partial,
  };
}

function answerRecord(
  partial: Partial<AnswerRecord> & Pick<AnswerRecord, 'answerId' | 'attemptId' | 'answeredAt'>,
): AnswerRecord {
  return {
    attemptKind: 'validation_quiz',
    attemptNo: 1,
    source: 'validation',
    notionIds: [NOTION],
    format: 'choice_question',
    correct: true,
    score: 1,
    maxScore: 1,
    selfRating: null,
    timeMs: 5000,
    chosenDistractorNotionId: null,
    confusedWithNotionId: null,
    normalizedResponse: null,
    offTopic: false,
    countsForGaps: true,
    ...partial,
  };
}

function emptyState(): PreviousNotionState {
  return {
    fsrs: null,
    mastery: 0,
    firstSeenAt: null,
    lastSeenAt: null,
    successCount: 0,
    gap: null,
    inReview: false,
  };
}

function history(answers: readonly AnswerRecord[]): NotionReviewHistory {
  return {
    mastery: answers.map((answer) => ({
      answerId: answer.answerId,
      attemptId: answer.attemptId,
      score: answer.score ?? 0,
      answeredAt: answer.answeredAt,
    })),
    gapAnswers: answers,
    timed: answers.map((answer) => ({
      answerId: answer.answerId,
      answeredAt: answer.answeredAt,
      timeMs: answer.timeMs,
      format: answer.format,
    })),
  };
}

describe('[SPEC-411] orchestration', () => {
  it('ne applique que les réponses corrigées, dans l’ordre des positions', () => {
    const selection = selectCorrectedAnswers([
      answerInput({ answerId: 'b', position: 2 }),
      answerInput({ answerId: 'pending', position: 3, isCorrect: null }),
      answerInput({ answerId: 'a', position: 1 }),
      answerInput({ answerId: 'text', position: 4, format: null }),
    ]);
    expect(selection.corrected.map((answer) => answer.answerId)).toEqual(['a', 'b']);
    expect(selection.pending.map((answer) => answer.answerId)).toEqual(['pending']);
    expect(selection.ignored.map((answer) => answer.answerId)).toEqual(['text']);
  });

  it('ne réapplique aucune paire réponse × notion déjà journalisée', () => {
    const candidates = [
      { answerId: 'a', notionId: NOTION },
      { answerId: 'b', notionId: NOTION },
    ];
    const applied = new Set([reviewKey('a', NOTION)]);
    expect(unappliedCandidates(candidates, applied)).toEqual([{ answerId: 'b', notionId: NOTION }]);
    expect(
      unappliedCandidates(candidates, new Set([reviewKey('a', NOTION), reviewKey('b', NOTION)])),
    ).toEqual([]);
  });

  it('fait évoluer la carte FSRS dans l’ordre des réponses', () => {
    const first = reviewAnswer({ answerId: 'a', answeredAt: FIRST });
    const second = reviewAnswer({ answerId: 'b', answeredAt: SECOND });
    const records = [
      answerRecord({ answerId: 'a', attemptId: ATTEMPT, answeredAt: FIRST }),
      answerRecord({ answerId: 'b', attemptId: ATTEMPT, answeredAt: SECOND }),
    ];
    const steps = planNotionReviews({
      notionId: NOTION,
      state: emptyState(),
      answers: [first, second],
      history: history(records),
    });
    expect(steps).toHaveLength(2);
    expect(steps[0]?.reviewedAt).toBe(FIRST);
    expect(steps[1]?.reviewedAt).toBe(SECOND);
    expect(steps[1]?.cardBefore.due).toBe(steps[0]?.cardAfter.due);
    expect(steps[1]?.successCountBefore).toBe(1);
    expect(steps[1]?.successCountAfter).toBe(2);
    expect(steps[1]?.masteryAfter).toBeGreaterThanOrEqual(steps[0]?.masteryAfter ?? 0);
  });

  it('détecte une lacune à la deuxième occurrence de la même erreur (CA-2)', () => {
    const previous = answerRecord({
      answerId: 'old',
      attemptId: 'attempt-old',
      answeredAt: '2026-11-10T10:00:00.000Z',
      correct: false,
      score: 0,
      chosenDistractorNotionId: 'n-other',
    });
    const current = reviewAnswer({
      answerId: 'new',
      answeredAt: FIRST,
      correct: false,
      chosenDistractorNotionId: 'n-other',
    });
    const currentRecord = answerRecord({
      answerId: 'new',
      attemptId: ATTEMPT,
      answeredAt: FIRST,
      correct: false,
      score: 0,
      chosenDistractorNotionId: 'n-other',
    });
    const steps = planNotionReviews({
      notionId: NOTION,
      state: emptyState(),
      answers: [current],
      history: history([previous, currentRecord]),
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]?.gapEvent?.kind).toBe('detected');
    expect(steps[0]?.gapEvent?.nature).toBe('confusion');
    expect(steps[0]?.gapAfter?.confusedWith).toBe('n-other');
  });

  it('lève une lacune après deux réussites espacées et une maîtrise au seuil', () => {
    const gap: GapState = {
      nature: 'forgetting',
      confusedWith: null,
      detectedAt: '2026-11-01T10:00:00.000Z',
      evidence: 'ancienne lacune',
      clearedAt: null,
    };
    const successes = [
      answerRecord({
        answerId: 's1',
        attemptId: 'old',
        answeredAt: '2026-11-09T10:00:00.000Z',
      }),
      answerRecord({ answerId: 's2', attemptId: ATTEMPT, answeredAt: FIRST }),
    ];
    const current = reviewAnswer({ answerId: 's2', answeredAt: FIRST });
    const steps = planNotionReviews({
      notionId: NOTION,
      state: { ...emptyState(), fsrs: null, mastery: 82, successCount: 4, gap },
      answers: [current],
      history: history(successes),
    });
    expect(steps).toHaveLength(1);
    expect(steps[0]?.gapEvent?.kind).toBe('cleared');
    expect(steps[0]?.gapAfter?.clearedAt).toBe(FIRST);
  });

  it('conserve le format de carte persisté (aller-retour)', () => {
    const persisted = {
      due: '2026-11-11T12:20:00.000Z',
      stability: 1.5,
      difficulty: 5.2,
      elapsed_days: 1,
      scheduled_days: 2,
      reps: 3,
      lapses: 0,
      state: 2 as const,
      last_review: '2026-11-10T12:20:00.000Z',
      learning_steps: 0,
    };
    const engineCard = fromPersistenceCard(persisted);
    expect(engineCard.state).toBe('review');
    expect(toPersistenceCard(engineCard)).toEqual(persisted);
  });
});
