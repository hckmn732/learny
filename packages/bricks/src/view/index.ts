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
export type {
  BrickResponse,
  BrickResponseMap,
  BrickVariant,
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
