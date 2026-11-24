// Adapter between the quiz correction of the contract and the one a brick view renders
// (SPEC-3304 ET-3, CA-1, BR-QUI-04; ADR-0150, SPEC-3301).
//
// `QuizFeedback.correction` (packages/contracts/src/attempts.ts) and `CorrectionView`
// (@learny/bricks, grade-types) describe the same facts for the three auto-corrected formats: the
// adapter only renames nothing and adds the tutor fields the open question expects. The screen never
// computes a verdict: correctness always comes from the check route (ET-3).
import type { CorrectionView } from '@learny/bricks';
import type { QuizFeedback } from '@learny/contracts';

/** Marker of a pending open answer: the tutor corrects it at the end (BR-QUI-04, CL-6). */
export const OPEN_PENDING = 'open-pending' as const;

/** Correction view of a checked question, or `undefined` while the correction is not available. */
export function toCorrectionView(
  feedback: QuizFeedback | null | undefined,
): CorrectionView | undefined {
  const correction = feedback?.correction;
  if (correction === null || correction === undefined) return undefined;
  const explanation = feedback?.explanation ?? correction.explanation;
  switch (correction.kind) {
    case 'choice_question':
      return {
        kind: 'choice_question',
        explanation,
        options: correction.options.map((option) => ({
          id: option.id,
          text: option.text,
          correct: option.correct,
          chosen: option.chosen,
        })),
      };
    case 'cloze':
      return {
        kind: 'cloze',
        explanation,
        gaps: correction.gaps.map((gap) => ({
          id: gap.id,
          given: gap.given,
          expected: gap.expected,
          correct: gap.correct,
        })),
      };
    case 'matching':
      return {
        kind: 'matching',
        explanation,
        pairs: correction.pairs.map((pair) => ({
          pairId: pair.pairId,
          left: pair.left,
          expectedRight: pair.expectedRight,
          givenRight: pair.givenRight,
          correct: pair.correct,
        })),
      };
    case 'open_question':
      return {
        kind: 'open_question',
        points: feedback?.score ?? 0,
        maxPoints: 100,
        criteria: correction.criteria.map((criterion) => ({
          key: criterion.key,
          label: criterion.label ?? criterion.key,
          ok: criterion.ok,
          comment: criterion.comment ?? null,
        })),
        missing: [...correction.missing],
        comment: null,
        explanation: explanation === '' ? null : explanation,
      };
  }
}

/** True when the server has not corrected the answer yet (open question, CL-6). */
export function isPendingCorrection(feedback: QuizFeedback | null | undefined): boolean {
  return (
    feedback?.pending === true || feedback?.isCorrect === null || feedback?.isCorrect === undefined
  );
}
