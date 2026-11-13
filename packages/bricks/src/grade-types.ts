// Grading contract of the auto-corrected bricks (SPEC-502 ET-2, BR-BRI-08). Every shape here is
// produced by pure, synchronous code: no I/O, no clock, no model call (BR-IA-09).
import type { BrickType } from './brick-types';

/** The six types corrected by `gradeBrick` (BR-BRI-08, EF-2). */
export const AUTO_GRADED_TYPES = [
  'choice_question',
  'cloze',
  'matching',
  'ordering',
  'categorization',
  'recall_card',
] as const;

export type AutoGradedType = (typeof AUTO_GRADED_TYPES)[number];

/** Self-assessment of a recall card (BR-MEM-02, EF-8). */
export const RECALL_SELF_GRADES = ['again', 'hard', 'good', 'easy'] as const;

export type RecallSelfGrade = (typeof RECALL_SELF_GRADES)[number];

/** A mistake between two different notions, recorded as a confusion by SPEC-404 (BR-MEM-05). */
export interface Confusion {
  notionId: string;
  confusedWithNotionId: string;
}

export interface ChoiceQuestionCorrection {
  kind: 'choice_question';
  explanation: string;
  options: Array<{ id: string; text: string; correct: boolean; chosen: boolean }>;
}

export interface ClozeCorrection {
  kind: 'cloze';
  explanation: string;
  gaps: Array<{ id: number; given: string; expected: string; correct: boolean }>;
}

export interface MatchingCorrection {
  kind: 'matching';
  explanation: string;
  pairs: Array<{
    pairId: string;
    left: string;
    expectedRight: string;
    givenRight: string | null;
    correct: boolean;
  }>;
}

export interface OrderingCorrection {
  kind: 'ordering';
  explanation: string;
  positions: Array<{
    id: string;
    text: string;
    expectedIndex: number;
    givenIndex: number;
    correct: boolean;
  }>;
}

export interface CategorizationCorrection {
  kind: 'categorization';
  explanation: string;
  items: Array<{
    id: string;
    text: string;
    expectedCategoryId: string;
    expectedCategoryLabel: string;
    givenCategoryId: string | null;
    givenCategoryLabel: string | null;
    correct: boolean;
  }>;
}

export interface RecallCardCorrection {
  kind: 'recall_card';
  front: string;
  back: string;
  selfGrade: RecallSelfGrade;
  fsrsGrade: RecallSelfGrade;
  correct: boolean;
  explanation: null;
}

/** Feedback produced by the tutor for a non-code-corrected type (SPEC-508 `grade_answer`). */
export interface TutorFeedbackBase {
  points: number;
  maxPoints: number;
  criteria: Array<{ key: string; label: string; ok: boolean; comment: string | null }>;
  missing: string[];
  comment: string | null;
  explanation: string | null;
}

export interface OpenQuestionCorrection extends TutorFeedbackBase {
  kind: 'open_question';
}

export interface InstructionCorrection extends TutorFeedbackBase {
  kind: 'instruction';
  verdict: 'Réussi' | 'À retravailler';
}

export interface ScriptedDialogueCorrection extends TutorFeedbackBase {
  kind: 'scripted_dialogue';
}

/** Types without any correction (sea of content, timer control, scoring scale). */
export interface EmptyCorrection {
  kind: 'none';
}

/** Correction view of every brick type, consumed by the rendering of SPEC-503. */
export interface CorrectionViewMap {
  text: EmptyCorrection;
  resource_excerpt: EmptyCorrection;
  choice_question: ChoiceQuestionCorrection;
  open_question: OpenQuestionCorrection;
  cloze: ClozeCorrection;
  matching: MatchingCorrection;
  ordering: OrderingCorrection;
  categorization: CategorizationCorrection;
  recall_card: RecallCardCorrection;
  instruction: InstructionCorrection;
  scripted_dialogue: ScriptedDialogueCorrection;
  timer: EmptyCorrection;
  scoring: EmptyCorrection;
}

export type CorrectionView<T extends BrickType = BrickType> = CorrectionViewMap[T];

/**
 * Why a response could not be graded. `RESPONSE_INVALID` carries one issue per invalid field;
 * `GRADED_BY_TUTOR` is the explicit refusal of BR-BRI-08 (CL-12).
 */
export interface GradeIssue {
  path: string;
  message: string;
}

export type GradeErrorCode = 'RESPONSE_INVALID' | 'GRADED_BY_TUTOR';

export interface GradeError {
  code: GradeErrorCode;
  issues: GradeIssue[];
}

/** Outcome of one code correction (ET-2). The correction is narrowed by the brick type. */
export interface GradeOutcome<T extends BrickType = BrickType> {
  isCorrect: boolean;
  /** Success in [0, 1], rounded to 4 decimals, half up. */
  score: number;
  chosenDistractorNotionId: string | null;
  /** Deduplicated, first-occurrence order kept. */
  confusions: Confusion[];
  /** Stable text used by the "same mistake" detection (ADR-0024). */
  normalizedResponse: string;
  feedbackTitle: 'Exact.' | 'Pas tout à fait.';
  correction: CorrectionView<T>;
}
