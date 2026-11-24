// Verdict of a correction, as the screen must show it (SPEC-3301 EF-2, BR-MEM-10).
//
// The correction the server sends back (ADR-0150 § 2) does not repeat the boolean of
// `GradeOutcome.isCorrect` for every type: a choice correction lists its options, a cloze its
// gaps. This module reads the verdict out of the correction itself, so a view never needs the
// graded outcome — and `verdict.test.ts` proves it agrees with `gradeBrick` on every example
// (CA-2). Pure: no React Native import.
import type { CorrectionView } from '@learny/bricks';

/** True when the correction carries no mistake at all. */
export function correctionIsCorrect(correction: CorrectionView): boolean {
  switch (correction.kind) {
    case 'choice_question': {
      const chosen = correction.options.filter((option) => option.chosen);
      return (
        chosen.length > 0 &&
        chosen.every((option) => option.correct) &&
        correction.options.filter((option) => option.correct).every((option) => option.chosen)
      );
    }
    case 'cloze':
      return correction.gaps.length > 0 && correction.gaps.every((gap) => gap.correct);
    case 'matching':
      return correction.pairs.length > 0 && correction.pairs.every((pair) => pair.correct);
    case 'ordering':
      return (
        correction.positions.length > 0 &&
        correction.positions.every((position) => position.correct)
      );
    case 'categorization':
      return correction.items.length > 0 && correction.items.every((item) => item.correct);
    case 'recall_card':
      return correction.correct;
    case 'open_question':
    case 'instruction':
    case 'scripted_dialogue':
      return correction.maxPoints > 0 && correction.points >= correction.maxPoints;
    case 'none':
      return true;
  }
}
