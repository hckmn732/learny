// State machine of one quiz question (SPEC-3304 ET-1, EF-4, CA-1, CA-4; BR-QUI-02, BR-QUI-04).
//
// Three phases and nothing else: `choosing` (the answer can still change), `checking` (the check
// request is in flight) and `checked` (the server answered: the answer is locked). The machine is
// pure — no React, no clock, no network — so `question-machine.test.ts` proves every transition and
// the screen never derives a verdict of its own (ET-3).
//
// Resume (CA-4, CL-4): the server sends the state of every question of the attempt, so the screen
// opens on the first question without any answer, never on the first one blindly.
import type { QuizFeedback, QuizQuestionDto } from '@learny/contracts';

/** Phase of one question of the attempt. */
export type QuestionPhase = 'choosing' | 'checking' | 'checked';

/** Local state of one question: its phase, its draft answer and the correction it received. */
export interface QuestionState {
  readonly position: number;
  readonly phase: QuestionPhase;
  readonly response: unknown;
  readonly feedback: QuizFeedback | null;
}

/** True when `response` carries nothing the server could grade. */
export function isEmptyResponse(response: unknown): boolean {
  if (response === null || response === undefined) return true;
  if (typeof response === 'string') return response.trim() === '';
  if (typeof response === 'object') {
    const values = Object.values(response as Record<string, unknown>);
    if (values.length === 0) return true;
    return values.every((value) => {
      if (value === null || value === undefined) return true;
      if (typeof value === 'string') return value.trim() === '';
      if (Array.isArray(value)) return value.length === 0;
      if (typeof value === 'object') return isEmptyResponse(value);
      return false;
    });
  }
  return false;
}

/** Initial state of every question of an attempt, as the server describes it (CA-4). */
export function initialStates(questions: readonly QuizQuestionDto[]): QuestionState[] {
  return questions.map((question) => ({
    position: question.position,
    phase: question.state === 'checked' ? 'checked' : 'choosing',
    response: question.response ?? null,
    feedback: question.feedback ?? null,
  }));
}

/** First question the learner still has to answer (CA-4, CL-4); the last one when all are done. */
export function firstOpenIndex(states: readonly QuestionState[]): number {
  const open = states.findIndex(
    (state) => state.phase !== 'checked' && isEmptyResponse(state.response),
  );
  if (open >= 0) return open;
  const unanswered = states.findIndex((state) => state.phase !== 'checked');
  return unanswered >= 0 ? unanswered : Math.max(0, states.length - 1);
}

/** Selects an answer while the question is still open (EF-4); ignored afterwards (BR-QUI-04). */
export function selectAnswer(state: QuestionState, response: unknown): QuestionState {
  if (state.phase !== 'choosing') return state;
  return { ...state, response };
}

/** True when the « Vérifier » button may be pressed (EF-4). */
export function canCheck(state: QuestionState): boolean {
  return state.phase === 'choosing' && !isEmptyResponse(state.response);
}

/** Marks the question as being checked; a second press is ignored (CL-2). */
export function startCheck(state: QuestionState): QuestionState {
  if (state.phase !== 'choosing') return state;
  return { ...state, phase: 'checking' };
}

/** Applies the correction sent back by `…/check` and locks the answer (BR-QUI-04). */
export function applyFeedback(state: QuestionState, feedback: QuizFeedback): QuestionState {
  return { ...state, phase: 'checked', feedback };
}

/** Returns to `choosing` after a failed check, keeping the selection (CL-1). */
export function failCheck(state: QuestionState): QuestionState {
  return { ...state, phase: 'choosing' };
}

/** True when the correction says the answer is right; a pending open answer is never wrong. */
export function feedbackIsCorrect(feedback: QuizFeedback | null): boolean {
  return feedback?.isCorrect === true;
}

/** Replaces the state of `position` in the list. */
export function replaceState(
  states: readonly QuestionState[],
  position: number,
  next: QuestionState,
): QuestionState[] {
  return states.map((state) => (state.position === position ? next : state));
}

/** True when `index` is the last question of the attempt (EF-4 « Terminer la tentative »). */
export function isLastQuestion(states: readonly QuestionState[], index: number): boolean {
  return index >= states.length - 1;
}

/** Position of the question at `index`, 1-based as the header shows it (EF-2). */
export function positionAt(states: readonly QuestionState[], index: number): number {
  return states[index]?.position ?? index + 1;
}
