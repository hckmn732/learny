// Public contracts of the planner (SPEC-407 ET-1). Every input is explicit: the engine never
// reads the clock, the database, the network or the configuration package. Durations come from
// `PlannerParams`, which services build from `ENGINE.planner` (ADR-0029, ADR-0280).
import type {
  Availability,
  Id,
  InstantIso,
  IsoDate,
  LocalTime,
  ModuleStatus,
  SlotKind,
  SlotStatus,
  StudySlot,
  TimeZone,
} from '../types';

export type PlannerFormationStatus = 'active' | 'paused';
export type PlannerObjective = 'operational' | 'exam' | 'dialogue' | 'project';
export type PlannerSlotCreator = 'planner' | 'automation' | 'learner';

/** Local window of one study moment (`HH:mm` in the learner's zone). */
export interface PlannerMoment {
  readonly start: LocalTime;
  readonly end: LocalTime;
}

export interface PlannerMoments {
  readonly matin: PlannerMoment;
  readonly apres_midi: PlannerMoment;
  readonly soir: PlannerMoment;
}

export interface PlannerMockExamParams {
  readonly questions: number;
  readonly minutesPerQuestion: number;
  readonly threshold: number;
}

/**
 * Business parameters of the planner, mirroring `ENGINE.planner` of `@learny/config/product`.
 * The service passes them explicitly; the pure engine never imports the configuration package.
 */
export interface PlannerParams {
  readonly moments: PlannerMoments;
  readonly revisionTailMinutes: number;
  readonly globalQuizMinutes: number;
  readonly sprintMinutes: number;
  readonly sprintDaysBeforeDefault: number;
  readonly allowedSprintDaysBefore: readonly number[];
  readonly validationQuizMinutes: number;
  readonly bufferMinutes: number;
  readonly contributionShare: number;
  readonly granularityMinutes: number;
  readonly mockExam: PlannerMockExamParams;
  readonly blockedDelayDays: number;
  readonly blockedModuleExtraDays: number;
  readonly maxHoursPerDay: number;
  readonly maintenanceGlobalQuizMinutes: number;
}

export interface PlannerChapter {
  readonly chapterId: Id;
  readonly position: number;
  readonly title?: string;
}

export interface PlannerModule {
  readonly moduleId: Id;
  readonly position: number;
  readonly title?: string;
  /** Volume of the module in hours; activities are derived from it (ADR-0280). */
  readonly hours: number;
  readonly chapters: readonly PlannerChapter[];
  readonly hasExercise?: boolean;
  readonly status?: ModuleStatus;
  /** Planned end of the module in the learner's zone, used by BR-FOR-14. */
  readonly deadline?: IsoDate;
}

export interface PlannerFormation {
  readonly formationId: Id;
  readonly title?: string;
  readonly endDate: IsoDate;
  readonly status?: PlannerFormationStatus;
  readonly objectives?: readonly PlannerObjective[];
  readonly modules: readonly PlannerModule[];
}

export interface PlannerPreferences {
  readonly tz: TimeZone;
  readonly availability: Availability;
  /** Public holidays and any other non-study day in the learner's zone. */
  readonly holidays?: readonly IsoDate[];
}

/** A slot already persisted before the replanning. */
export interface ExistingPlannerSlot {
  readonly slotId: Id;
  readonly formationId: Id | null;
  readonly moduleId: Id | null;
  readonly kind: SlotKind;
  readonly title: string;
  readonly startsAt: InstantIso;
  readonly endsAt: InstantIso;
  readonly status: SlotStatus;
  readonly createdBy?: PlannerSlotCreator;
  readonly movedFromId?: Id | null;
}

/** A slot returned by the planner. */
export interface PlannedSlot {
  readonly slotId: Id;
  readonly formationId: Id | null;
  readonly moduleId: Id | null;
  readonly kind: SlotKind;
  readonly title: string;
  readonly startsAt: InstantIso;
  readonly endsAt: InstantIso;
  readonly status: SlotStatus;
  readonly createdBy: PlannerSlotCreator;
  readonly movedFromId: Id | null;
}

export interface PlanConflict {
  readonly date: IsoDate;
  readonly kind: 'overlap' | 'capacity';
  readonly slotIds: readonly Id[];
  readonly message: string;
}

export interface DayCapacity {
  readonly date: IsoDate;
  readonly totalMinutes: number;
  readonly usedMinutes: number;
  readonly remainingMinutes: number;
}

export interface UnscheduledActivity {
  readonly formationId: Id;
  readonly moduleId: Id | null;
  readonly kind: SlotKind;
  readonly title: string;
  readonly minutes: number;
  readonly reason: string;
}

export type ReplanOptionKind = 'shift_end' | 'increase_volume' | 'lighten';

/** One of the three BR-FOR-14 options. Never applied by the planner itself. */
export interface ReplanOption {
  readonly formationId: Id;
  readonly kind: ReplanOptionKind;
  readonly feasible: boolean;
  readonly reason: string | null;
  readonly currentEndDate: IsoDate;
  readonly projectedEndDate: IsoDate | null;
  readonly extraDays: number | null;
  readonly currentHoursPerDay: number;
  readonly newHoursPerDay: number | null;
  readonly removedMinutes: number | null;
}

export interface FormationDeadline {
  readonly formationId: Id;
  readonly endDate: IsoDate;
  readonly projectedEndDate: IsoDate;
  readonly missed: boolean;
  readonly blockedModules: readonly Id[];
}

export interface PlanResult {
  /** Every slot, sorted by start instant then by stable identifier. */
  readonly slots: readonly PlannedSlot[];
  readonly conflicts: readonly PlanConflict[];
  readonly remainingCapacity: readonly DayCapacity[];
  /** Empty when every formation fits; otherwise three options per missed formation. */
  readonly options: readonly ReplanOption[];
  readonly deadlines: readonly FormationDeadline[];
  readonly unscheduled: readonly UnscheduledActivity[];
}

export interface PlanScheduleInput {
  readonly formations: readonly PlannerFormation[];
  readonly preferences: PlannerPreferences;
  readonly params: PlannerParams;
  readonly existingSlots?: readonly ExistingPlannerSlot[];
  readonly now: InstantIso;
}

export type ReplanReason =
  'module_validated' | 'session_missed' | 'pause' | 'resume' | 'rhythm_change' | 'manual';

/**
 * Incremental replanning (ET-3). The caller expresses the event through the data: a validated
 * module has `status: 'validated'`, a paused formation `status: 'paused'`, a missed session is an
 * existing slot `status: 'missed'`, and a rhythm change updates `preferences`.
 */
export interface ReplanScheduleInput extends PlanScheduleInput {
  readonly reason?: ReplanReason;
}

export interface CompatibleSlotActivity {
  readonly durationMinutes: number;
  readonly kind?: SlotKind;
  readonly formationId?: Id | null;
  readonly moduleId?: Id | null;
  readonly title?: string;
}

export interface PlannerCalendar {
  readonly now: InstantIso;
  readonly params: PlannerParams;
  readonly slots: readonly ExistingPlannerSlot[];
  readonly holidays?: readonly IsoDate[];
}

export interface CompatibleSlot {
  readonly date: IsoDate;
  readonly moment: StudySlot;
  readonly startsAt: InstantIso;
  readonly endsAt: InstantIso;
}
