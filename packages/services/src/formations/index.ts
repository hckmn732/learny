// Public API of the formation-management services (SPEC-618).
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
export { pauseFormation } from './pause';
export { resumeFormation } from './resume';
export { switchCurrentFormation } from './switch-current';
export { buildManagementState } from './state';
