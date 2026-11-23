// Segments of the quiz progress bar (SPEC-3304 EF-2, CA-2; maquette `*-05-quiz.png`).
//
// The mockup draws one segment per question of the attempt: a correct answer is lime, a wrong one
// orange, the current question ink and the next ones grey. The count comes from the attempt
// (BR-QUI-01, 10 to 20 questions), never from a constant. Pure: no React Native import.
import type { QuestionState } from './question-machine';
import { feedbackIsCorrect } from './question-machine';

export type SegmentTone = 'correct' | 'wrong' | 'pending' | 'current' | 'upcoming';

/**
 * Tone of every segment, in the order of the attempt: `checked` questions keep the verdict the
 * server gave, an open answer still waiting for the tutor stays neutral (`pending`).
 */
export function progressSegments(
  states: readonly QuestionState[],
  currentIndex: number,
): SegmentTone[] {
  return states.map((state, index) => {
    if (state.phase === 'checked') {
      if (state.feedback?.isCorrect === true) return 'correct';
      if (state.feedback?.isCorrect === false) return 'wrong';
      return 'pending';
    }
    return index === currentIndex ? 'current' : 'upcoming';
  });
}

/** Number of questions already corrected, for the screen-reader label of the bar (CA-2). */
export function correctedCount(states: readonly QuestionState[]): number {
  return states.filter((state) => state.phase === 'checked').length;
}

/** Number of correct answers known so far (never a score: the server grades, ET-3). */
export function correctCount(states: readonly QuestionState[]): number {
  return states.filter((state) => feedbackIsCorrect(state.feedback)).length;
}
