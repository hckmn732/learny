// Correction views consumed by the brick renderer (ADR-0152, SPEC-503 EF-1 and SPEC-502 ET-2).
// SPEC-502 is not a declared dependency of SPEC-503: the union is defined here and the grading
// specification reuses it instead of shipping a second, incompatible shape.
import type { BrickType } from './brick-types';
import type { TableCheckResult } from './types/instruction/table-checks';

export type FeedbackTitle = 'Exact.' | 'Pas tout à fait.';

export type SelfGrade = 'again' | 'hard' | 'good' | 'easy';

export interface CriterionCorrection {
  key: string;
  label: string;
  ok: boolean;
  points: number;
  detail?: string;
}

interface CorrectionBase {
  isCorrect: boolean;
  feedbackTitle: FeedbackTitle;
  explanation?: string;
}

export interface ChoiceQuestionCorrection extends CorrectionBase {
  kind: 'choice_question';
  options: { id: string; correct: boolean; rationale?: string | null }[];
}

export interface ClozeCorrection extends CorrectionBase {
  kind: 'cloze';
  gaps: { id: number; expected: string; given: string; correct: boolean }[];
}

export interface MatchingCorrection extends CorrectionBase {
  kind: 'matching';
  pairs: {
    pairId: string;
    expectedRightId: string;
    givenRightId: string | null;
    correct: boolean;
  }[];
}

export interface OrderingCorrection extends CorrectionBase {
  kind: 'ordering';
  positions: { id: string; expectedIndex: number; givenIndex: number; correct: boolean }[];
}

export interface CategorizationCorrection extends CorrectionBase {
  kind: 'categorization';
  items: {
    id: string;
    expectedCategoryId: string;
    givenCategoryId: string | null;
    correct: boolean;
  }[];
}

export interface RecallCardCorrection extends CorrectionBase {
  kind: 'recall_card';
  selfGrade: SelfGrade;
}

export interface OpenQuestionCorrection extends CorrectionBase {
  kind: 'open_question';
  tutorNote: string;
  score: number;
  maxScore: number;
  criteria: CriterionCorrection[];
  missingElements: string[];
}

export interface InstructionCorrection extends CorrectionBase {
  kind: 'instruction';
  tutorNote: string;
  score: number;
  maxScore: number;
  verdict: 'Réussi' | 'À retravailler';
  criteria: CriterionCorrection[];
  tableChecks?: TableCheckResult[];
}

export interface ScriptedDialogueCorrection extends CorrectionBase {
  kind: 'scripted_dialogue';
  tutorNote?: string;
  criteria: CriterionCorrection[];
}

export interface ContentCorrection {
  kind: 'text' | 'resource_excerpt' | 'timer' | 'scoring';
}

export interface CorrectionViewMap {
  text: ContentCorrection;
  resource_excerpt: ContentCorrection;
  choice_question: ChoiceQuestionCorrection;
  open_question: OpenQuestionCorrection;
  cloze: ClozeCorrection;
  matching: MatchingCorrection;
  ordering: OrderingCorrection;
  categorization: CategorizationCorrection;
  recall_card: RecallCardCorrection;
  instruction: InstructionCorrection;
  scripted_dialogue: ScriptedDialogueCorrection;
  timer: ContentCorrection;
  scoring: ContentCorrection;
}

export type CorrectionView<T extends BrickType = BrickType> = CorrectionViewMap[T];
