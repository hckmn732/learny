// Public planner API (SPEC-407 ET-5). Pure functions only; the service passes the learner's
// preferences, the business parameters and the current instant explicitly.
export { findCompatibleSlots } from './find-compatible-slots';
export { planSchedule } from './plan';
export { replanSchedule } from './replan';
export type {
  CompatibleSlot,
  CompatibleSlotActivity,
  DayCapacity,
  ExistingPlannerSlot,
  FormationDeadline,
  PlanConflict,
  PlanResult,
  PlanScheduleInput,
  PlannedSlot,
  PlannerCalendar,
  PlannerChapter,
  PlannerFormation,
  PlannerFormationStatus,
  PlannerMockExamParams,
  PlannerMoment,
  PlannerMoments,
  PlannerModule,
  PlannerObjective,
  PlannerParams,
  PlannerPreferences,
  PlannerSlotCreator,
  ReplanOption,
  ReplanOptionKind,
  ReplanReason,
  ReplanScheduleInput,
  UnscheduledActivity,
} from './types';
