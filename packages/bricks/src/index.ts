// Public contract of `@learny/bricks` (SPEC-501 ET-1): the thirteen types, their normative schemas,
// the validation/oracle, the fingerprint and the public payloads. SPEC-502 adds the pure grading
// contract: response schemas, six code graders, the table control, the scales and the timer.
export { BRICK_ORIGINS, BRICK_PURPOSES, BRICK_TYPES } from './brick-types';
export type { BrickOrigin, BrickPurpose, BrickType } from './brick-types';
export {
  brickDraftSchema,
  controlCharacterIssues,
  criterionKey,
  columnKey,
  integer,
  itemId,
  optionalText,
  sourceRefSchema,
  sourcesSchema,
  text,
  trimDeep,
  uuid,
  zodIssuesToBrickIssues,
} from './common';
export type { BrickDraft } from './common';
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
} from './correction-view';
export { brickExamples } from './examples';
export { brickFingerprint, canonicalAnswer, stemText } from './fingerprint';
export { clampTutorScore, gradeBrick } from './grade';
export { AUTO_GRADED_TYPES, RECALL_SELF_GRADES } from './grade-types';
export type {
  AutoGradedType,
  CategorizationCorrection,
  ChoiceQuestionCorrection,
  ClozeCorrection,
  Confusion,
  CorrectionView,
  CorrectionViewMap,
  EmptyCorrection,
  GradeError,
  GradeErrorCode,
  GradeIssue,
  GradeOutcome,
  InstructionCorrection,
  MatchingCorrection,
  OpenQuestionCorrection,
  OrderingCorrection,
  RecallCardCorrection,
  RecallSelfGrade,
  ScriptedDialogueCorrection,
  TutorFeedbackBase,
} from './grade-types';
export { BRICK_ISSUE_CODES, brickIssue, uniqueIssues } from './issues';
export type { BrickIssue, BrickIssueCode } from './issues';
export { normalizeText, comparisonKey } from './normalize';
export type {
  AnyBrickPayload,
  AnyPublicPayload,
  BrickExample,
  BrickPayload,
  BrickPayloadMap,
  PublicPayload,
  PublicPayloadMap,
} from './payloads';
export { createSeededRandom, hash32, mulberry32, shuffleSeeded } from './random';
export { emptyRefs, withSources } from './references';
export type { BrickRef, BrickRefs } from './references';
export { brickRegistry } from './registry';
export type { BrickDefinition } from './registry';
export { sha256Hex } from './sha256';
export {
  computeActivityScore,
  computeExerciseScore,
  ScoringItemUnknownError,
} from './types/scoring/compute';
export type { ActivityScore, ExerciseScore } from './types/scoring/compute';
export { formatRemaining, timerState } from './types/timer/state';
export type { TimerState } from './types/timer/state';
export { evaluateTableChecks, parseFrenchNumber } from './types/instruction/table-checks';
export type {
  TableCheckResult,
  TableCheckState,
  TableProduction,
} from './types/instruction/table-checks';
export {
  instructionFileResponseSchema,
  instructionLinkResponseSchema,
  instructionTableResponseSchema,
  instructionTextResponseSchema,
  parseInstructionResponse,
} from './types/instruction/response';
export type {
  FileResponse,
  InstructionResponse,
  LinkResponse,
  TableResponse,
  TextResponse,
} from './types/instruction/response';
export {
  categorizationResponseSchema,
  parseCategorizationResponse,
} from './types/categorization/response';
export type { CategorizationResponse } from './types/categorization/response';
export { choiceResponseSchema, parseChoiceResponse } from './types/choice-question/response';
export type { ChoiceResponse } from './types/choice-question/response';
export { clozeResponseSchema, parseClozeResponse } from './types/cloze/response';
export type { ClozeResponse } from './types/cloze/response';
export { matchingResponseSchema, parseMatchingResponse } from './types/matching/response';
export type { MatchingResponse } from './types/matching/response';
export { opaqueMapping } from './types/matching/public';
export type { MatchingOpaqueRight } from './types/matching/public';
export { orderingResponseSchema, parseOrderingResponse } from './types/ordering/response';
export type { OrderingResponse } from './types/ordering/response';
export { parseRecallCardResponse, recallCardResponseSchema } from './types/recall-card/response';
export type { RecallCardResponse, RecallCardSelfGrade } from './types/recall-card/response';
export { BRICK_RESOURCE_KINDS, parseBrickPayload, validateBrick } from './validate';
export type {
  BrickReferenceResolver,
  BrickResourceInfo,
  BrickResourceKind,
  ValidBrick,
} from './validate';
export type { BrickPublic, PublicBrickInput } from './public-brick';
export { BRICK_PUBLIC_REQUIRED_ABSENT_FIELDS, toPublicBrick } from './public-brick';
export { evaluateTableChecks, parseFrenchNumber } from './types/instruction/table-checks';
export type { TableCheckResult, TableResponse } from './types/instruction/table-checks';
export { timerState } from './types/timer/state';
export type { TimerState, TimerStateInput } from './types/timer/state';
