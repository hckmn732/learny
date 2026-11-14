'use client';

import { RecallCardView, type SelfGrade } from '@learny/bricks/view';
import type { ReviewItemDto } from '@learny/contracts';

export interface RecallCardGameProps {
  item: ReviewItemDto;
  dueLabels?: Partial<Record<SelfGrade, string>> | undefined;
  pending: boolean;
  onGrade: (selfRating: SelfGrade) => void;
}

interface AnswerResult {
  notions?: { rating?: string }[];
}

/** Self-grade already recorded for this item, replayed from the server result (EF-9, BR-MEM-10). */
function recordedGrade(item: ReviewItemDto): SelfGrade | undefined {
  if (item.state !== 'answered') return undefined;
  const result = item.result as AnswerResult | null;
  const rating = result?.notions?.[0]?.rating;
  if (rating === 'again' || rating === 'hard' || rating === 'good' || rating === 'easy') {
    return rating;
  }
  return undefined;
}

/**
 * SCR-10 §10.5 — recall card of the session (SPEC-701 EF-9). The shared SPEC-503 view owns the
 * flip and the four buttons; this wrapper supplies the real FSRS due labels, locks the card as
 * soon as the answer is in flight or recorded, and replays the recorded grade read-only.
 */
export function RecallCardGame(props: RecallCardGameProps) {
  const grade = recordedGrade(props.item);
  const locked = props.pending || props.item.state !== 'todo';
  return (
    <div data-testid="gq-recall" className="flex flex-col gap-12">
      <RecallCardView
        brick={{
          versionId: props.item.brickVersionId,
          type: 'recall_card',
          notionLabels: [],
          publicPayload: props.item.payload as never,
        }}
        correction={
          grade === undefined
            ? undefined
            : {
                kind: 'recall_card',
                selfGrade: grade,
                isCorrect: grade !== 'again',
                feedbackTitle: grade === 'again' ? 'Pas tout à fait.' : 'Exact.',
              }
        }
        dueLabels={props.dueLabels}
        onChange={(value) => {
          props.onGrade(value.selfGrade);
        }}
        recallTestIds={{
          front: 'recall-card-front',
          back: 'recall-card-back',
          flip: 'recall-card-flip',
          grade: (key) => `recall-grade-${key}`,
        }}
        status={locked ? 'locked' : 'idle'}
        value={grade === undefined ? null : { selfGrade: grade }}
        variant="game"
      />
    </div>
  );
}
