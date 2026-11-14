'use client';

// Public entry point of the brick views (SPEC-503 ET-1): `@learny/bricks/view`.
export { BrickRenderer } from './BrickRenderer';
export { FeedbackBox } from './feedback-box';
export type { FeedbackTone } from './feedback-box';
export { ExcerptChip } from './excerpt-chip';
export type { ExcerptChipProps, ExcerptKind } from './excerpt-chip';
export { brickViewLabels, resolveLabels } from './labels';
export type { BrickViewLabels, BrickViewLabelsOverride } from './labels';
export { MarkdownContent } from './markdown';
export { QuestionHeader } from './question-header';
export { brickViews } from './registry';
export type { BrickView } from './registry';
export { CategorizationView } from '../types/categorization/view';
export { ChoiceQuestionView } from '../types/choice-question/view';
export { ClozeView } from '../types/cloze/view';
export { InstructionView } from '../types/instruction/view';
export { MatchingView } from '../types/matching/view';
export { OpenQuestionView } from '../types/open-question/view';
export { OrderingView } from '../types/ordering/view';
export { RecallCardView } from '../types/recall-card/view';
export { ResourceExcerptView } from '../types/resource-excerpt/view';
export { ScoringView } from '../types/scoring/view';
export { ScriptedDialogueView } from '../types/scripted-dialogue/view';
export { TextView } from '../types/text/view';
export { TimerView } from '../types/timer/view';
export type {
  BrickResponse,
  BrickResponseMap,
  BrickVariant,
  BrickViewBrick,
  BrickViewProps,
  BrickViewStatus,
  CategorizationResponse,
  ChoiceQuestionResponse,
  ClozeResponse,
  ExcerptLocation,
  ExcerptOpenRef,
  InstructionResponse,
  MatchingResponse,
  OpenQuestionResponse,
  OrderingResponse,
  RecallCardResponse,
  RecallCardTestIds,
} from '../view-types';
export type {
  CategorizationCorrection,
  ChoiceQuestionCorrection,
  ClozeCorrection,
  CorrectionView,
  CorrectionViewMap,
  CriterionCorrection,
  FeedbackTitle,
  InstructionCorrection,
  MatchingCorrection,
  OpenQuestionCorrection,
  OrderingCorrection,
  RecallCardCorrection,
  ScriptedDialogueCorrection,
  SelfGrade,
} from '../correction-view';
