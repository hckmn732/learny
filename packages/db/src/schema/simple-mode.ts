// Simple mode schema (SPEC-4001 ET-3; ADR-4003; docs/architecture/data-model.md §2, §3).
//
// A simple-mode formation is created from documents instead of a scoping conversation: its sources
// are formation-level `resources` (null `chapter_id`) whose `metadata.role` says how the document
// feeds the programme. `simple_analyses` follows the single analysis of a formation (steps, detected
// chapters, section summaries, diagnostic state); `chapter_sources` binds a chapter to the page
// range of the document it comes from.
//
// SQL that Drizzle cannot express lives in the custom migration `simple_mode_rules`: RLS (ADR-0112,
// ADR-0113), the `formations.simple_motivation` bound check and the `chapter_sources` owner check.
import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { chapters, formations } from './formations';
import { profiles } from './identity';
import { resources } from './resources';

/** BR-APP-01 — documented key of `resources.metadata.role`, never a column (ADR-4003 D4). */
export const RESOURCE_ROLES = ['course', 'exercises', 'exam_papers', 'other'] as const;

/** EF-6 — lifecycle of the single analysis of a simple-mode formation. */
export const simpleStatus = pgEnum('simple_status', [
  'collecting',
  'analysing',
  'proposed',
  'failed',
]);

/** EF-11 — the diagnostic is proposed once: rendered, skipped, or still to do. */
export const DIAGNOSTIC_STATUSES = ['none', 'done', 'skipped'] as const;

export const SIMPLE_STATUSES = simpleStatus.enumValues;
export type SimpleStatusValue = (typeof SIMPLE_STATUSES)[number];
export type ResourceRoleValue = (typeof RESOURCE_ROLES)[number];

/** EF-6, EF-7 — one row per simple-mode formation, carrying the resumable analysis state. */
export const simpleAnalyses = pgTable(
  'simple_analyses',
  {
    formationId: uuid('formation_id')
      .primaryKey()
      .references(() => formations.id, { onDelete: 'cascade' }),
    /** ADR-0113 — direct RLS scope without joining the formation. */
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    status: simpleStatus('status').notNull().default('collecting'),
    /** EF-6 — ordered steps `{key, state, detail}`; the worker rewrites one step at a time. */
    steps: jsonb('steps').notNull(),
    /** EF-7 — detected sections `{position, title}` of the `course` document. */
    chaptersFound: jsonb('chapters_found')
      .notNull()
      .default(sql`'[]'::jsonb`),
    /** EF-7 — up to 150 words per section, the only input of the programme task. */
    sectionSummaries: jsonb('section_summaries')
      .notNull()
      .default(sql`'[]'::jsonb`),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    diagnosticStatus: text('diagnostic_status').notNull().default('none'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('simple_analyses_owner_id_idx').on(table.ownerId),
    check('simple_analyses_steps_check', sql`jsonb_typeof(${table.steps}) = 'array'`),
    check(
      'simple_analyses_chapters_found_check',
      sql`jsonb_typeof(${table.chaptersFound}) = 'array'`,
    ),
    check(
      'simple_analyses_section_summaries_check',
      sql`jsonb_typeof(${table.sectionSummaries}) = 'array'`,
    ),
    check(
      'simple_analyses_error_code_length_check',
      sql`${table.errorCode} is null or char_length(${table.errorCode}) <= 64`,
    ),
    check(
      'simple_analyses_error_message_length_check',
      sql`${table.errorMessage} is null or char_length(${table.errorMessage}) <= 1000`,
    ),
    check(
      'simple_analyses_diagnostic_status_check',
      sql`${table.diagnosticStatus} in ('none', 'done', 'skipped')`,
    ),
  ],
);

/**
 * EF-9, BR-APP-06 — the page range of a source that a chapter comes from. `formation_id` is copied
 * from the chapter (ADR-0113) so the RLS policy filters without a join.
 */
export const chapterSources = pgTable(
  'chapter_sources',
  {
    chapterId: uuid('chapter_id').notNull(),
    resourceId: uuid('resource_id')
      .notNull()
      .references(() => resources.id, { onDelete: 'cascade' }),
    formationId: uuid('formation_id')
      .notNull()
      .references(() => formations.id, { onDelete: 'cascade' }),
    pageFrom: integer('page_from'),
    pageTo: integer('page_to'),
  },
  (table) => [
    primaryKey({ columns: [table.chapterId, table.resourceId] }),
    foreignKey({
      name: 'chapter_sources_chapter_id_chapters_id_fk',
      columns: [table.chapterId],
      foreignColumns: [chapters.id],
    }).onDelete('cascade'),
    index('chapter_sources_formation_id_idx').on(table.formationId),
    index('chapter_sources_resource_id_idx').on(table.resourceId),
    check(
      'chapter_sources_page_from_check',
      sql`${table.pageFrom} is null or ${table.pageFrom} >= 1`,
    ),
    check('chapter_sources_page_to_check', sql`${table.pageTo} is null or ${table.pageTo} >= 1`),
    check(
      'chapter_sources_pages_order_check',
      sql`${table.pageTo} is null or ${table.pageFrom} is null or ${table.pageTo} >= ${table.pageFrom}`,
    ),
  ],
);

export type SimpleAnalysis = typeof simpleAnalyses.$inferSelect;
export type NewSimpleAnalysis = typeof simpleAnalyses.$inferInsert;
export type ChapterSource = typeof chapterSources.$inferSelect;
export type NewChapterSource = typeof chapterSources.$inferInsert;
