// Question-bank jobs (SPEC-513 ET-2, ET-4, ADR-0026, ADR-0301).
//
// One row per `(learner, notion, format, course version)`: that tuple is the idempotence key of the
// batch. The row keeps only counters, a safe error code and the lifecycle status; the questions
// themselves live in `bricks`/`brick_versions` with `purpose = 'bank'`. A replaced course version
// keeps its own jobs (CL-4), so history is never rewritten.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { brickType } from './bricks-activities';
import { courses } from './courses';
import { jobStatus } from './enums';
import { formations, notions } from './formations';
import { profiles } from './identity';

/** The four formats of a personal bank, mirrored from `@learny/contracts`. */
export const QUESTION_BANK_FORMATS = [
  'choice_question',
  'open_question',
  'cloze',
  'matching',
] as const;

export const QUESTION_BANK_REASONS = [
  'course_generated',
  'exhaustion',
  'nightly',
  'manual',
] as const;

export const questionBankJobs = pgTable(
  'question_bank_jobs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    formationId: uuid('formation_id')
      .notNull()
      .references(() => formations.id, { onDelete: 'cascade' }),
    notionId: uuid('notion_id')
      .notNull()
      .references(() => notions.id, { onDelete: 'cascade' }),
    /** The prepared course version; a new row keeps the previous version's jobs (CL-4). */
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    format: brickType('format').notNull(),
    reason: text('reason').notNull(),
    status: jobStatus('status').notNull().default('queued'),
    requestedCount: smallint('requested_count').notNull().default(4),
    availableCount: integer('available_count').notNull().default(0),
    insertedCount: integer('inserted_count').notNull().default(0),
    duplicateCount: integer('duplicate_count').notNull().default(0),
    complete: boolean('complete').notNull().default(false),
    /** A stable code (`INCOMPLETE_BANK`, `AI_TIMEOUT`, …), never a provider message. */
    errorCode: text('error_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // ET-2 — the idempotence key groups learner, notion, format and course version.
    unique('question_bank_jobs_key_unique').on(
      table.userId,
      table.notionId,
      table.format,
      table.courseId,
    ),
    index('question_bank_jobs_pending_idx').on(table.status, table.updatedAt),
    index('question_bank_jobs_user_idx').on(table.userId, table.createdAt),
    check(
      'question_bank_jobs_reason_check',
      sql`${table.reason} in ('course_generated', 'exhaustion', 'nightly', 'manual')`,
    ),
    check(
      'question_bank_jobs_format_check',
      sql`${table.format} in ('choice_question', 'open_question', 'cloze', 'matching')`,
    ),
    check(
      'question_bank_jobs_requested_count_check',
      sql`${table.requestedCount} between 4 and 20`,
    ),
    check(
      'question_bank_jobs_counts_check',
      sql`${table.availableCount} >= 0 and ${table.insertedCount} >= 0 and ${table.duplicateCount} >= 0`,
    ),
    check(
      'question_bank_jobs_error_code_check',
      sql`${table.errorCode} is null or char_length(${table.errorCode}) <= 80`,
    ),
  ],
);

export type QuestionBankJobRow = typeof questionBankJobs.$inferSelect;
export type NewQuestionBankJob = typeof questionBankJobs.$inferInsert;
