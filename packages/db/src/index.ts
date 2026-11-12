// Public API of @learny/db (SPEC-101 ET-1).
export {
  DATABASE_HINT,
  DEFAULT_DATABASE_URL,
  annotateConnectionError,
  buildUserClaims,
  closeDb,
  createPostgresDatabase,
  serviceDb,
  userDb,
} from './client';
export type {
  DatabaseHandle,
  DatabaseOptions,
  Db,
  DbTx,
  UserContext,
  UserDatabase,
} from './client';

// Compatibility alias named by the package contract; `userDb` is the canonical entry point.
export { userDb as createUserDb } from './client';

export { sql } from 'drizzle-orm';

export * as schema from './schema/index';

// Six tables of the brick/activity/attempt domain and their enumerations (SPEC-106 EF-6). They are
// also reachable as `schema.*`; the named exports give services their Drizzle types directly.
export {
  ACTIVITY_KINDS,
  ACTIVITY_STATUSES,
  ATTEMPT_STATUSES,
  BRICK_PURPOSES,
  BRICK_STATUSES,
  BRICK_TYPES,
  GRADERS,
  REPORT_STATUSES,
  activities,
  activityKind,
  activityStatus,
  answers,
  attemptStatus,
  attempts,
  brickPurpose,
  brickReports,
  brickStatus,
  brickType,
  brickVersions,
  bricks,
  grader,
  reportStatus,
} from './schema/bricks-activities';
export type {
  Activity,
  ActivityKind,
  ActivityStatus,
  Answer,
  Attempt,
  AttemptStatus,
  Brick,
  BrickPurpose,
  BrickReport,
  BrickStatus,
  BrickType,
  BrickVersion,
  Grader,
  NewActivity,
  NewAnswer,
  NewAttempt,
  NewBrick,
  NewBrickReport,
  NewBrickVersion,
  ReportStatus,
} from './schema/bricks-activities';

// Repositories validated at the boundary of the database (SPEC-106 ET-4, ET-5).
export * from './repositories/activities';

// Three tables of the memory/gap domain and their enumerations (SPEC-107 EF-1 to EF-4). The FSRS
// card schema and its persistence adapter are exported for the learning engine (SPEC-402).
export {
  FSRS_GRADES_VALUES,
  GAP_EVENT_KINDS_VALUES,
  GAP_NATURES_VALUES,
  REVIEW_SOURCES_VALUES,
  fsrsGrade,
  gapEventKind,
  gapEvents,
  gapNature,
  notionStates,
  reviewLogs,
  reviewSource,
} from './schema/memory';
export type {
  FsrsGradeValue,
  GapEvent,
  GapEventKindValue,
  GapNature,
  NewGapEvent,
  NewNotionState,
  NewReviewLog,
  NotionState,
  ReviewLog,
  ReviewSourceValue,
} from './schema/memory';
export {
  FSRS_GRADES,
  FSRS_STATES,
  GAP_EVENT_KINDS,
  GAP_NATURES,
  REVIEW_SOURCES,
  fsrsCardSchema,
  gapEvidenceSchema,
  masterySchema,
  parseFsrsCard,
  revisionSchema,
  successCountSchema,
  timeMsSchema,
  toFsrsCardJson,
  toUtcIso,
  utcInstantSchema,
} from './schema/memory-json';
export type {
  FsrsCardInput,
  FsrsCardJson,
  FsrsGrade,
  FsrsState,
  GapEventKind,
  GapEvidence,
  GapNatureValue,
  ReviewSource,
} from './schema/memory-json';

// Repositories of the memory/gap domain (SPEC-107 EF-5, ET-5).
export * from './repositories/notion-states';

// Four tables of the agenda/automation/streak domain and their six enumerations (SPEC-108 EF-1 to
// EF-5). `automation_key` is shared with `automation_settings` (SPEC-710).
export {
  ACTIVE_SLOT_STATUSES,
  AUTOMATION_STATUSES,
  MILESTONE_KEYS,
  MOVABLE_SLOT_STATUSES,
  SLOT_CREATORS,
  SLOT_KINDS,
  SLOT_STATUSES,
  activityMinutesSchema,
  activitySourcesSchema,
  automationActions,
  automationPayloadSchema,
  automationStatus,
  automationSummarySchema,
  dailyActivity,
  milestoneKey,
  milestones,
  planningDaySchema,
  planningInstantSchema,
  scheduleSlots,
  slotCreator,
  slotKind,
  slotStatus,
  slotWindowSchema,
} from './schema/planning';
export type {
  AutomationAction,
  AutomationKey,
  AutomationStatus,
  DailyActivity,
  Milestone,
  MilestoneKey,
  NewAutomationAction,
  NewDailyActivity,
  NewMilestone,
  NewScheduleSlot,
  ScheduleSlot,
  SlotCreator,
  SlotKind,
  SlotStatus,
} from './schema/planning';

// The automation enumeration is declared with the identity schema (SPEC-102) and reused by the
// action journal (SPEC-108).
export { AUTOMATION_KEYS, automationKey } from './schema/identity';

// Repositories of the agenda, the automation journal, the daily activity and the milestones
// (SPEC-108 ET-2, ET-5, EF-2, EF-4, EF-5).
export * from './repositories/schedule-slots';
export * from './repositories/automation-actions';
export * from './repositories/daily-activity';
export * from './repositories/milestones';

// Two tables of the notification domain and their three enumerations (SPEC-109 EF-1 to EF-5).
// `notification_type` follows `data-model.md` §8; the delivery journal keeps the decision taken for
// each external channel (ADR-0031, ADR-0214).
export {
  DELIVERY_CHANNELS,
  DELIVERY_STATUSES,
  ERROR_DELIVERY_STATUSES,
  NOTIFICATION_FILTERS,
  NOTIFICATION_TYPES,
  SCHEDULED_DELIVERY_STATUSES,
  deliveryChannel,
  deliveryErrorSchema,
  deliveryStatus,
  notificationBodySchema,
  notificationDedupeKeySchema,
  notificationDeliveries,
  notificationHrefSchema,
  notificationIconSchema,
  notificationInstantSchema,
  notificationTitleSchema,
  notificationType,
  notifications,
} from './schema/notifications';
export type {
  DeliveryChannel,
  DeliveryStatus,
  NewNotification,
  NewNotificationDelivery,
  Notification,
  NotificationDelivery,
  NotificationFilter,
  NotificationType,
} from './schema/notifications';

// Repositories of the inbox and of the delivery journal (SPEC-109 EF-2 to EF-5, ET-3 to ET-5).
export * from './repositories/notifications';
