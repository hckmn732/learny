// Memory and gap schema (SPEC-107 EF-1 to EF-4, ET-1 to ET-3; data-model.md §6).
//
// `notion_states` keeps one FSRS card and the current mastery/gap state per `(user, notion)`;
// `review_logs` is the append-only pedagogical history of every applied revision; `gap_events`
// records the lifecycle of a gap. The FSRS algorithm lives in `@learny/learning-engine` (SPEC-402
// to SPEC-404); this module stores its inputs and outputs and never recalculates them in SQL.
//
// SQL that Drizzle cannot express lives in the custom migration `memory_rules`: RLS and owner
// policies (ET-4, ADR-0112), the same-formation check of a confusion, the append-only guards and
// the `set_updated_at` trigger. Scheduling is never overwritten: `revision` is the optimistic
// concurrency token used by the repository (`applyReview`, ET-5).
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { answers } from './bricks-activities';
import { notions } from './formations';
import { profiles } from './identity';
import {
  FSRS_GRADES,
  GAP_EVENT_KINDS,
  GAP_NATURES,
  REVIEW_SOURCES,
  type FsrsCardJson,
} from './memory-json';

/** EF-2, ADR-0024 — the four natures of a gap, by priority order of BR-LAC-03. */
export const gapNature = pgEnum('gap_nature', GAP_NATURES);

/** EF-3, BR-MEM-02 — the four FSRS grades. */
export const fsrsGrade = pgEnum('fsrs_grade', FSRS_GRADES);

/** EF-3 — the activity that produced a review. */
export const reviewSource = pgEnum('review_source', REVIEW_SOURCES);

/** EF-4 — lifecycle of a gap. */
export const gapEventKind = pgEnum('gap_event_kind', GAP_EVENT_KINDS);

export const GAP_NATURES_VALUES = gapNature.enumValues;
export const FSRS_GRADES_VALUES = fsrsGrade.enumValues;
export const REVIEW_SOURCES_VALUES = reviewSource.enumValues;
export const GAP_EVENT_KINDS_VALUES = gapEventKind.enumValues;

/**
 * EF-1, ET-1, ET-3 — one FSRS card, mastery and optional gap per learner and notion. `due_at`
 * duplicates `fsrs.due` for the partial index read by the daily quiz (EF-5); `revision` is bumped
 * on every change so a concurrent answer cannot silently overwrite an applied revision (ET-5).
 */
export const notionStates = pgTable(
  'notion_states',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    notionId: uuid('notion_id')
      .notNull()
      .references(() => notions.id, { onDelete: 'cascade' }),
    fsrs: jsonb('fsrs').$type<FsrsCardJson>().notNull(),
    dueAt: timestamp('due_at', { withTimezone: true }),
    mastery: numeric('mastery', { precision: 5, scale: 2 }).notNull().default('0'),
    firstSeenAt: timestamp('first_seen_at', { withTimezone: true }),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    successCount: integer('success_count').notNull().default(0),
    gapNature: gapNature('gap_nature'),
    gapConfusedWith: uuid('gap_confused_with').references(() => notions.id, {
      onDelete: 'set null',
    }),
    gapDetectedAt: timestamp('gap_detected_at', { withTimezone: true }),
    gapEvidence: text('gap_evidence'),
    gapClearedAt: timestamp('gap_cleared_at', { withTimezone: true }),
    suspended: boolean('suspended').notNull().default(false),
    inReview: boolean('in_review').notNull().default(false),
    revision: integer('revision').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({
      name: 'notion_states_pkey',
      columns: [table.userId, table.notionId],
    }),
    // EF-5, ET-1 — the daily quiz reads only due rows of one learner, in due order.
    index('notion_states_due_idx')
      .on(table.userId, table.dueAt)
      .where(sql`${table.inReview}`),
    index('notion_states_notion_id_idx').on(table.notionId),
    index('notion_states_gap_confused_with_idx').on(table.gapConfusedWith),
    check('notion_states_mastery_check', sql`${table.mastery} between 0 and 100`),
    check('notion_states_success_count_check', sql`${table.successCount} >= 0`),
    check('notion_states_revision_check', sql`${table.revision} >= 0`),
    // EF-2 — a notion never confuses itself with itself.
    check(
      'notion_states_gap_confused_not_self_check',
      sql`${table.gapConfusedWith} is null or ${table.gapConfusedWith} <> ${table.notionId}`,
    ),
    // ET-3 — only a confusion keeps the notion it is confused with.
    check(
      'notion_states_gap_confused_nature_check',
      sql`${table.gapConfusedWith} is null or ${table.gapNature} = 'confusion'`,
    ),
    // EF-2 — an active nature always carries its detection instant.
    check(
      'notion_states_gap_detected_at_check',
      sql`${table.gapNature} is null or ${table.gapDetectedAt} is not null`,
    ),
    check(
      'notion_states_gap_cleared_at_check',
      sql`${table.gapClearedAt} is null or ${table.gapDetectedAt} is null or ${table.gapClearedAt} >= ${table.gapDetectedAt}`,
    ),
    // CL-1, ET-2 — the serialised card keeps the nine required fields and their JSON types.
    check(
      'notion_states_fsrs_check',
      sql`jsonb_typeof(${table.fsrs}) = 'object'
        and ${table.fsrs} ? 'due'
        and ${table.fsrs} ? 'stability'
        and ${table.fsrs} ? 'difficulty'
        and ${table.fsrs} ? 'elapsed_days'
        and ${table.fsrs} ? 'scheduled_days'
        and ${table.fsrs} ? 'reps'
        and ${table.fsrs} ? 'lapses'
        and ${table.fsrs} ? 'state'
        and ${table.fsrs} ? 'last_review'
        and jsonb_typeof(${table.fsrs} -> 'due') = 'string'
        and jsonb_typeof(${table.fsrs} -> 'stability') = 'number'
        and jsonb_typeof(${table.fsrs} -> 'difficulty') = 'number'
        and jsonb_typeof(${table.fsrs} -> 'elapsed_days') = 'number'
        and jsonb_typeof(${table.fsrs} -> 'scheduled_days') = 'number'
        and jsonb_typeof(${table.fsrs} -> 'reps') = 'number'
        and jsonb_typeof(${table.fsrs} -> 'lapses') = 'number'
        and jsonb_typeof(${table.fsrs} -> 'state') = 'number'
        and jsonb_typeof(${table.fsrs} -> 'last_review') in ('string', 'null')`,
    ),
  ],
);

/**
 * EF-3, CL-5, ET-1 — one row per applied revision. The log is append-only: the custom migration
 * refuses every update, and RLS exposes it read-only to its owner (ADR-0112). `answer_id` is set to
 * null when the attempt answer is deleted, keeping the pedagogical measurements.
 */
export const reviewLogs = pgTable(
  'review_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    notionId: uuid('notion_id')
      .notNull()
      .references(() => notions.id, { onDelete: 'cascade' }),
    answerId: uuid('answer_id').references(() => answers.id, { onDelete: 'set null' }),
    source: reviewSource('source').notNull(),
    grade: fsrsGrade('grade').notNull(),
    correct: boolean('correct'),
    timeMs: integer('time_ms'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }).notNull().defaultNow(),
    fsrsBefore: jsonb('fsrs_before').$type<FsrsCardJson>(),
    fsrsAfter: jsonb('fsrs_after').$type<FsrsCardJson>(),
  },
  (table) => [
    // ET-1 — chronological history of one notion.
    index('review_logs_user_id_notion_id_reviewed_at_idx').on(
      table.userId,
      table.notionId,
      table.reviewedAt,
    ),
    index('review_logs_answer_id_idx').on(table.answerId),
    check('review_logs_time_ms_check', sql`${table.timeMs} is null or ${table.timeMs} >= 0`),
    check(
      'review_logs_fsrs_before_check',
      sql`${table.fsrsBefore} is null or jsonb_typeof(${table.fsrsBefore}) = 'object'`,
    ),
    check(
      'review_logs_fsrs_after_check',
      sql`${table.fsrsAfter} is null or jsonb_typeof(${table.fsrsAfter}) = 'object'`,
    ),
  ],
);

/**
 * EF-4 — lifecycle event of a gap. `notion_states` keeps the current state; this table keeps the
 * history. An event is inserted in the same transaction as the state change.
 */
export const gapEvents = pgTable(
  'gap_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    notionId: uuid('notion_id')
      .notNull()
      .references(() => notions.id, { onDelete: 'cascade' }),
    kind: gapEventKind('kind').notNull(),
    nature: gapNature('nature'),
    evidence: jsonb('evidence').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('gap_events_user_id_notion_id_created_at_idx').on(
      table.userId,
      table.notionId,
      table.createdAt,
    ),
    check('gap_events_nature_check', sql`${table.kind} = 'cleared' or ${table.nature} is not null`),
    check(
      'gap_events_evidence_check',
      sql`${table.evidence} is null or jsonb_typeof(${table.evidence}) = 'object'`,
    ),
  ],
);

export type NotionState = typeof notionStates.$inferSelect;
export type NewNotionState = typeof notionStates.$inferInsert;
export type ReviewLog = typeof reviewLogs.$inferSelect;
export type NewReviewLog = typeof reviewLogs.$inferInsert;
export type GapEvent = typeof gapEvents.$inferSelect;
export type NewGapEvent = typeof gapEvents.$inferInsert;
export type GapNature = (typeof GAP_NATURES_VALUES)[number];
export type FsrsGradeValue = (typeof FSRS_GRADES_VALUES)[number];
export type ReviewSourceValue = (typeof REVIEW_SOURCES_VALUES)[number];
export type GapEventKindValue = (typeof GAP_EVENT_KINDS_VALUES)[number];
