// Bricks, activities, attempts and answers schema (SPEC-106 ET-1, ET-2, ET-3;
// docs/architecture/data-model.md §5). A brick is personal to the learner (ADR-0026/ADR-0035) and
// versioned: every new content creates a new `brick_versions` row, and an answer keeps the exact
// version it presented (BR-BRI-06). An activity assembles valid bricks of its own learner; the
// transactional guard `assert_activity_items_owned` refuses a reported brick, a foreign brick or a
// version that does not belong to the brick before an activity becomes `ready` (BR-BRI-06,
// ADR-0021). Attempts are numbered per `(activity, user)` and answers are unique by position.
//
// SQL that Drizzle cannot express lives in the custom migration `bricks_activities_rules`: RLS and
// owner policies (ADR-0112), the immutability of a brick version, the ready-activity guard and the
// owner consistency of reports and attempts.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import type {
  ActivityConfig,
  ActivityItem,
  AnswerFeedback,
  AnswerResponse,
  AttemptPerNotion,
  AttemptReviewFeedback,
  BrickReportResolution,
} from './bricks-json';
import { actor, contentOrigin } from './enums';
import { formations, modules, notions } from './formations';
import { profiles } from './identity';

/** BR-BRI-01 — the thirteen types of bricks; a new type requires code. */
export const brickType = pgEnum('brick_type', [
  'text',
  'resource_excerpt',
  'choice_question',
  'open_question',
  'cloze',
  'matching',
  'ordering',
  'categorization',
  'recall_card',
  'instruction',
  'scripted_dialogue',
  'timer',
  'scoring',
]);

/** BR-BRI-09 — why the tutor assembled a brick. */
export const brickPurpose = pgEnum('brick_purpose', [
  'course',
  'validation',
  'bank',
  'remediation',
  'exercise',
  'exam',
  'warmup',
  'review',
]);

/** EF-1, BR-BRI-06 — a reported brick can no longer enter a new activity. */
export const brickStatus = pgEnum('brick_status', ['active', 'reported', 'retired']);

/** BR-BRI-09 — activity kinds of V1 and V2. */
export const activityKind = pgEnum('activity_kind', [
  'course',
  'validation_quiz',
  'global_quiz_session',
  'remediation',
  'exercise',
  'mock_exam',
  'warmup',
  'micro_session',
  'sprint',
  'self_test',
  'scripted_dialogue',
  'project_step',
]);

/** EF-3 — an activity is a draft until its items are checked, then ready, later archived. */
export const activityStatus = pgEnum('activity_status', ['draft', 'ready', 'archived']);

/** EF-4 — lifecycle of an attempt. */
export const attemptStatus = pgEnum('attempt_status', [
  'in_progress',
  'submitted',
  'graded',
  'timed_out',
  'abandoned',
]);

/** EF-5, BR-BRI-08 — who graded an answer. */
export const grader = pgEnum('grader', ['code', 'tutor']);

/** EF-2 — report lifecycle (data-model §5 `report_status`). */
export const reportStatus = pgEnum('report_status', ['open', 'corrected', 'dismissed']);

export const BRICK_TYPES = brickType.enumValues;
export const BRICK_PURPOSES = brickPurpose.enumValues;
export const BRICK_STATUSES = brickStatus.enumValues;
export const ACTIVITY_KINDS = activityKind.enumValues;
export const ACTIVITY_STATUSES = activityStatus.enumValues;
export const ATTEMPT_STATUSES = attemptStatus.enumValues;
export const GRADERS = grader.enumValues;
export const REPORT_STATUSES = reportStatus.enumValues;

/** EF-1 — a personal, versioned brick attached to a formation and its notions. */
export const bricks = pgTable(
  'bricks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    formationId: uuid('formation_id')
      .notNull()
      .references(() => formations.id, { onDelete: 'cascade' }),
    type: brickType('type').notNull(),
    notionIds: uuid('notion_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    purpose: brickPurpose('purpose').notNull(),
    status: brickStatus('status').notNull().default('active'),
    currentVersion: integer('current_version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('bricks_owner_id_idx').on(table.ownerId),
    index('bricks_formation_id_idx').on(table.formationId),
    index('bricks_owner_status_idx').on(table.ownerId, table.status),
    index('bricks_notion_ids_idx').using('gin', table.notionIds),
    check('bricks_current_version_check', sql`${table.currentVersion} >= 1`),
    check('bricks_notion_ids_count_check', sql`cardinality(${table.notionIds}) <= 50`),
  ],
);

/**
 * EF-2, BR-BRI-06 — one version of a brick. A row is never rewritten: the custom migration
 * `bricks_activities_rules` refuses every update. `fingerprint` is the SHA-256 of a question
 * (BR-BRI-07) and is indexed for reuse checks owned by SPEC-513.
 */
export const brickVersions = pgTable(
  'brick_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    brickId: uuid('brick_id')
      .notNull()
      .references(() => bricks.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    payload: jsonb('payload').notNull(),
    fingerprint: text('fingerprint'),
    origin: contentOrigin('origin').notNull(),
    createdBy: actor('created_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('brick_versions_brick_id_version_unique').on(table.brickId, table.version),
    // Lets `brick_reports` prove with a composite foreign key that the version belongs to the brick.
    unique('brick_versions_id_brick_id_unique').on(table.id, table.brickId),
    index('brick_versions_fingerprint_idx')
      .on(table.fingerprint)
      .where(sql`${table.fingerprint} is not null`),
    check('brick_versions_version_check', sql`${table.version} >= 1`),
    check('brick_versions_payload_check', sql`jsonb_typeof(${table.payload}) = 'object'`),
    check(
      'brick_versions_fingerprint_check',
      sql`${table.fingerprint} is null or ${table.fingerprint} ~ '^[0-9a-f]{64}$'`,
    ),
  ],
);

/** EF-2, BR-BRI-06 — a learner reports a brick; the resolution keeps the report history. */
export const brickReports = pgTable(
  'brick_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    brickId: uuid('brick_id')
      .notNull()
      .references(() => bricks.id, { onDelete: 'cascade' }),
    brickVersionId: uuid('brick_version_id').notNull(),
    reason: text('reason').notNull(),
    status: reportStatus('status').notNull().default('open'),
    resolution: jsonb('resolution').$type<BrickReportResolution>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    // The reported version must belong to the reported brick (BR-BRI-06).
    foreignKey({
      name: 'brick_reports_version_brick_fk',
      columns: [table.brickVersionId, table.brickId],
      foreignColumns: [brickVersions.id, brickVersions.brickId],
    }).onDelete('cascade'),
    index('brick_reports_user_id_idx').on(table.userId),
    index('brick_reports_brick_id_idx').on(table.brickId),
    check('brick_reports_reason_length_check', sql`char_length(${table.reason}) between 1 and 500`),
    check(
      'brick_reports_resolution_check',
      sql`${table.resolution} is null or jsonb_typeof(${table.resolution}) = 'object'`,
    ),
    check(
      'brick_reports_resolved_at_check',
      sql`(${table.status} = 'open') = (${table.resolvedAt} is null)`,
    ),
  ],
);

/** EF-3, BR-BRI-09 — ordered assembly of brick versions, decided by the tutor. */
export const activities = pgTable(
  'activities',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    formationId: uuid('formation_id')
      .notNull()
      .references(() => formations.id, { onDelete: 'cascade' }),
    moduleId: uuid('module_id').references(() => modules.id, { onDelete: 'cascade' }),
    kind: activityKind('kind').notNull(),
    config: jsonb('config').$type<ActivityConfig>().notNull().default({}),
    items: jsonb('items')
      .$type<ActivityItem[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    status: activityStatus('status').notNull().default('draft'),
    forDate: date('for_date', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('activities_owner_id_idx').on(table.ownerId),
    index('activities_owner_status_idx').on(table.ownerId, table.status),
    index('activities_formation_id_idx').on(table.formationId),
    index('activities_module_id_idx').on(table.moduleId),
    index('activities_for_date_idx').on(table.forDate),
    check('activities_config_check', sql`jsonb_typeof(${table.config}) = 'object'`),
    check('activities_items_check', sql`jsonb_typeof(${table.items}) = 'array'`),
    // EF-3, ET-4 — a ready activity has a non-empty ordered list of items.
    check(
      'activities_ready_items_check',
      sql`${table.status} <> 'ready' or jsonb_array_length(${table.items}) > 0`,
    ),
  ],
);

/** EF-4 — one attempt of an activity by a learner, numbered per `(activity, user)`. */
export const attempts = pgTable(
  'attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    activityId: uuid('activity_id')
      .notNull()
      .references(() => activities.id, { onDelete: 'cascade' }),
    attemptNo: integer('attempt_no').notNull(),
    status: attemptStatus('status').notNull().default('in_progress'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    deadlineAt: timestamp('deadline_at', { withTimezone: true }),
    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    durationMs: integer('duration_ms'),
    score: numeric('score', { precision: 5, scale: 2 }),
    passed: boolean('passed'),
    perNotion: jsonb('per_notion').$type<AttemptPerNotion>().notNull().default({}),
    hintsUsed: smallint('hints_used').notNull().default(0),
    reviewFeedback: jsonb('review_feedback').$type<AttemptReviewFeedback>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // EF-4, ET-3 — two attempts never share the same number for one activity and user.
    unique('attempts_activity_id_user_id_attempt_no_unique').on(
      table.activityId,
      table.userId,
      table.attemptNo,
    ),
    index('attempts_user_id_idx').on(table.userId),
    index('attempts_activity_id_idx').on(table.activityId),
    check('attempts_attempt_no_check', sql`${table.attemptNo} >= 1`),
    check(
      'attempts_duration_ms_check',
      sql`${table.durationMs} is null or ${table.durationMs} >= 0`,
    ),
    check('attempts_score_check', sql`${table.score} is null or ${table.score} between 0 and 100`),
    check('attempts_hints_used_check', sql`${table.hintsUsed} >= 0`),
    check('attempts_per_notion_check', sql`jsonb_typeof(${table.perNotion}) = 'object'`),
    check(
      'attempts_review_feedback_check',
      sql`${table.reviewFeedback} is null or jsonb_typeof(${table.reviewFeedback}) = 'object'`,
    ),
  ],
);

/**
 * EF-5, BR-BRI-06 — the learner response to one position. `brick_version_id` is the version shown
 * during the attempt: publishing a newer version never rewrites past answers.
 */
export const answers = pgTable(
  'answers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    attemptId: uuid('attempt_id')
      .notNull()
      .references(() => attempts.id, { onDelete: 'cascade' }),
    brickVersionId: uuid('brick_version_id')
      .notNull()
      .references(() => brickVersions.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    response: jsonb('response').$type<AnswerResponse>().notNull().default({}),
    isCorrect: boolean('is_correct'),
    score: numeric('score', { precision: 5, scale: 2 }),
    maxScore: numeric('max_score', { precision: 5, scale: 2 }),
    timeMs: integer('time_ms'),
    gradedBy: grader('graded_by'),
    feedback: jsonb('feedback').$type<AnswerFeedback>(),
    chosenDistractorNotionId: uuid('chosen_distractor_notion_id').references(() => notions.id, {
      onDelete: 'set null',
    }),
    markedForReview: boolean('marked_for_review').notNull().default(false),
    answeredAt: timestamp('answered_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // EF-5, ET-3 — one answer per attempt position.
    unique('answers_attempt_id_position_unique').on(table.attemptId, table.position),
    index('answers_attempt_id_idx').on(table.attemptId),
    index('answers_brick_version_id_idx').on(table.brickVersionId),
    index('answers_chosen_distractor_notion_id_idx').on(table.chosenDistractorNotionId),
    check('answers_position_check', sql`${table.position} >= 1`),
    check('answers_response_check', sql`jsonb_typeof(${table.response}) in ('object', 'array')`),
    check('answers_score_check', sql`${table.score} is null or ${table.score} between 0 and 100`),
    check(
      'answers_max_score_check',
      sql`${table.maxScore} is null or ${table.maxScore} between 0 and 100`,
    ),
    // CL-6 — a score never exceeds its maximum.
    check(
      'answers_score_max_score_check',
      sql`${table.score} is null or ${table.maxScore} is null or ${table.score} <= ${table.maxScore}`,
    ),
    check('answers_time_ms_check', sql`${table.timeMs} is null or ${table.timeMs} >= 0`),
    check(
      'answers_feedback_check',
      sql`${table.feedback} is null or jsonb_typeof(${table.feedback}) = 'object'`,
    ),
  ],
);

export type Brick = typeof bricks.$inferSelect;
export type NewBrick = typeof bricks.$inferInsert;
export type BrickVersion = typeof brickVersions.$inferSelect;
export type NewBrickVersion = typeof brickVersions.$inferInsert;
export type BrickReport = typeof brickReports.$inferSelect;
export type NewBrickReport = typeof brickReports.$inferInsert;
export type Activity = typeof activities.$inferSelect;
export type NewActivity = typeof activities.$inferInsert;
export type Attempt = typeof attempts.$inferSelect;
export type NewAttempt = typeof attempts.$inferInsert;
export type Answer = typeof answers.$inferSelect;
export type NewAnswer = typeof answers.$inferInsert;
export type BrickType = (typeof BRICK_TYPES)[number];
export type BrickPurpose = (typeof BRICK_PURPOSES)[number];
export type BrickStatus = (typeof BRICK_STATUSES)[number];
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];
export type AttemptStatus = (typeof ATTEMPT_STATUSES)[number];
export type Grader = (typeof GRADERS)[number];
export type ReportStatus = (typeof REPORT_STATUSES)[number];
