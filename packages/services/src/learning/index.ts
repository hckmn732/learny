// Learning persistence services (SPEC-411): transactional application, due notions and plan.
export {
  applyLearningResult,
  fromPersistenceCard,
  planNotionReviews,
  reviewKey,
  selectCorrectedAnswers,
  toPersistenceCard,
  unappliedCandidates,
} from './apply-result';
export type {
  ApplyLearningResultOptions,
  CorrectedAnswerSelection,
  LearningApplyHooks,
  LearningEngineParams,
  NotionPlanInput,
  NotionReviewAnswer,
  NotionReviewHistory,
  NotionReviewStep,
  PlannedGapEvent,
  PreviousNotionState,
  ReviewAnswerInput,
} from './apply-result';
export { getDueNotions } from './get-due-notions';
export { persistPlan } from './persist-plan';
export { completeScheduleSlot } from './slots';
export type { CompleteSlotResult } from './slots';
