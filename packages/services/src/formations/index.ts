// Public API of the formation-management services (SPEC-618).
export { canAccessFormation } from './access';
export {
  MAX_ACTIVE_FORMATIONS,
  activeFormationsForLimit,
  activeLimitDecision,
  nextCurrentFormation,
  transitionFor,
} from './active-limit';
export type {
  ActiveLimitDecision,
  CurrentCandidate,
  FormationAction,
  ManagedStatus,
  TransitionDecision,
} from './active-limit';
export { archiveFormation } from './archive';
export {
  buildFinalReview,
  dueCountFor,
  isFormationComplete,
  maintenanceEffects,
  retentionDisplay,
} from './final-review';
export { getFinalReview } from './get-final-review';
export { setMaintenance } from './set-maintenance';
export { pauseFormation } from './pause';
export { resumeFormation } from './resume';
export { switchCurrentFormation } from './switch-current';
export { buildManagementState } from './state';
