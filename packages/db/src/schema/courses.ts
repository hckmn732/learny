// Course and tutor-discussion schema (SPEC-105 ET-1, ET-2, ET-5;
// docs/architecture/data-model.md §4). A course is personal to the learner even inside a shared
// formation (ADR-0026/ADR-0035): it is versioned per `(owner_id, module_id)` and only one version is
// current (BR-COU-10). Sections carry the rendered course, their previous states are archived in
// `course_section_revisions`, citations point at the passages they quote (ADR-0039), reading
// progress and chapter summaries reference the version that was read, and the tutor keeps one
// conversation per opening (ADR-0040).
//
// SQL that Drizzle cannot express lives in the custom migration `courses_rules`: RLS (ADR-0112),
// `set_updated_at`, the single-current switch, the section revision archive, the owner consistency
// checks and the conversation touch trigger (ET-3).
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import type { ChapterSummaryFeedback, SelfTest, TutorMessageSource } from './courses.json-schemas';
import { actor, contentOrigin } from './enums';
import { chapters, formations, messageRole, modules } from './formations';
import { profiles } from './identity';
import { resourceChunks, resources } from './resources';

/** BR-COU-01 — a course is generated, then ready or failed. */
export const courseStatus = pgEnum('course_status', ['generating', 'ready', 'failed']);

/** BR-COU-04 — kinds of course sections (the summary and interactions close a chapter). */
export const sectionKind = pgEnum('section_kind', [
  'text',
  'flash_question',
  'dont_confuse',
  'tutor_completed',
  'retain',
  'summary_prompt',
]);

/** BR-COU-10, ADR-0039 — media of a citation, used to render its source link. */
export const citationMedia = pgEnum('citation_media', [
  'pdf',
  'audio',
  'video',
  'web',
  'note',
  'image',
]);

export const COURSE_STATUSES = courseStatus.enumValues;
export const SECTION_KINDS = sectionKind.enumValues;
export const CITATION_MEDIA = citationMedia.enumValues;

/** BR-COU-10 — one version of a personal course; `courses_one_current_idx` keeps one current row. */
export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** ADR-0113 — copied from the module so reading and search filter without a join. */
    formationId: uuid('formation_id')
      .notNull()
      .references(() => formations.id, { onDelete: 'cascade' }),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    isCurrent: boolean('is_current').notNull().default(true),
    status: courseStatus('status').notNull().default('generating'),
    model: text('model'),
    error: text('error'),
    /**
     * SPEC-608 ET-2 — deterministic key of the generation request (`course-generation:<module>:…`).
     * A replay returns the version created by the first run instead of writing another one.
     */
    generationKey: text('generation_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('courses_owner_id_module_id_version_unique').on(
      table.ownerId,
      table.moduleId,
      table.version,
    ),
    // EF-1/EF-2 — a single current version per course (partial unique index).
    uniqueIndex('courses_one_current_idx')
      .on(table.ownerId, table.moduleId)
      .where(sql`${table.isCurrent}`),
    index('courses_owner_formation_idx').on(table.ownerId, table.formationId),
    uniqueIndex('courses_generation_key_idx').on(
      table.ownerId,
      table.moduleId,
      table.generationKey,
    ),
    check(
      'courses_generation_key_length_check',
      sql`${table.generationKey} is null or char_length(${table.generationKey}) between 1 and 200`,
    ),
    check('courses_version_check', sql`${table.version} >= 1`),
    check(
      'courses_model_length_check',
      sql`${table.model} is null or char_length(${table.model}) <= 120`,
    ),
    check(
      'courses_error_length_check',
      sql`${table.error} is null or char_length(${table.error}) <= 2000`,
    ),
    check(
      'courses_failed_has_error',
      sql`${table.status} <> 'failed' or ${table.error} is not null`,
    ),
  ],
);

/** BR-COU-09 — lifecycle of a learner report on a course section (history is kept). */
export const courseSectionReportStatus = pgEnum('course_section_report_status', [
  'open',
  'corrected',
  'dismissed',
]);

/** BR-COU-04 — ordered sections of a course version, anchored for the table of contents. */
export const courseSections = pgTable(
  'course_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    /** ADR-0113 — direct scope for RLS and readings. */
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    kind: sectionKind('kind').notNull(),
    anchor: text('anchor').notNull(),
    title: text('title'),
    contentMd: text('content_md'),
    data: jsonb('data'),
    notionIds: uuid('notion_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    origin: contentOrigin('origin').notNull(),
    version: integer('version').notNull().default(1),
    reported: boolean('reported').notNull().default(false),
    /** ET-2 — key of the learner correction that produced this version; a replay is a no-op. */
    editRequestKey: text('edit_request_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('course_sections_course_id_chapter_id_position_unique').on(
      table.courseId,
      table.chapterId,
      table.position,
    ),
    unique('course_sections_course_id_anchor_unique').on(table.courseId, table.anchor),
    index('course_sections_owner_id_idx').on(table.ownerId),
    index('course_sections_chapter_id_idx').on(table.chapterId),
    index('course_sections_notion_ids_idx').using('gin', table.notionIds),
    check('course_sections_position_check', sql`${table.position} >= 1`),
    // EF-3 — anchor: lower-case letters, digits and single dashes, at most 80 characters.
    check(
      'course_sections_anchor_check',
      sql`${table.anchor} ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(${table.anchor}) <= 80`,
    ),
    check(
      'course_sections_title_length_check',
      sql`${table.title} is null or char_length(${table.title}) <= 200`,
    ),
    check(
      'course_sections_content_md_length_check',
      sql`${table.contentMd} is null or char_length(${table.contentMd}) <= 50000`,
    ),
    check(
      'course_sections_data_check',
      sql`${table.data} is null or jsonb_typeof(${table.data}) = 'object'`,
    ),
    check('course_sections_version_check', sql`${table.version} >= 1`),
    uniqueIndex('course_sections_edit_request_key_idx')
      .on(table.ownerId, table.editRequestKey)
      .where(sql`${table.editRequestKey} is not null`),
    check(
      'course_sections_edit_request_key_check',
      sql`${table.editRequestKey} is null or ${table.editRequestKey} ~ '^[A-Za-z0-9_-]{8,128}$'`,
    ),
  ],
);

/** EF-4, ADR-0113 — archived state of a section before a learner or tutor correction. */
export const courseSectionRevisions = pgTable(
  'course_section_revisions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => courseSections.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    title: text('title'),
    contentMd: text('content_md'),
    data: jsonb('data'),
    editedBy: actor('edited_by').notNull(),
    /** ET-2 — replays of a learner correction return the first version instead of writing again. */
    requestKey: text('request_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('course_section_revisions_section_id_version_unique').on(table.sectionId, table.version),
    uniqueIndex('course_section_revisions_request_key_idx')
      .on(table.ownerId, table.requestKey)
      .where(sql`${table.requestKey} is not null`),
    index('course_section_revisions_owner_id_idx').on(table.ownerId),
    check('course_section_revisions_version_check', sql`${table.version} >= 1`),
    check(
      'course_section_revisions_request_key_check',
      sql`${table.requestKey} is null or ${table.requestKey} ~ '^[A-Za-z0-9_-]{8,128}$'`,
    ),
  ],
);

/**
 * BR-COU-09, BR-MEM-09 — one report of a course section. Reporting keeps the content readable,
 * archives the motivation, excludes the section from new quiz draws until correction and records
 * the bank bricks that were suspended so a correction can reactivate only those.
 */
export const courseSectionReports = pgTable(
  'course_section_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => courseSections.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    status: courseSectionReportStatus('status').notNull().default('open'),
    affectedBrickIds: uuid('affected_brick_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    /** ET-2 — a replay with the same key returns the first report and emits no second event. */
    requestKey: text('request_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('course_section_reports_request_key_idx')
      .on(table.ownerId, table.requestKey)
      .where(sql`${table.requestKey} is not null`),
    index('course_section_reports_section_id_idx').on(table.sectionId),
    index('course_section_reports_owner_id_idx').on(table.ownerId),
    check(
      'course_section_reports_reason_length_check',
      sql`char_length(${table.reason}) between 1 and 500`,
    ),
    check(
      'course_section_reports_affected_bricks_check',
      sql`cardinality(${table.affectedBrickIds}) <= 500`,
    ),
    check(
      'course_section_reports_request_key_check',
      sql`${table.requestKey} is null or ${table.requestKey} ~ '^[A-Za-z0-9_-]{8,128}$'`,
    ),
  ],
);

/**
 * BR-COU-10, ADR-0039 — a quoted passage. `chunk_id` and `resource_id` are nulled when the source is
 * deleted while the citation is kept and displayed as « source supprimée ».
 */
export const citations = pgTable(
  'citations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => courseSections.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    chunkId: uuid('chunk_id').references(() => resourceChunks.id, { onDelete: 'set null' }),
    resourceId: uuid('resource_id').references(() => resources.id, { onDelete: 'set null' }),
    quote: text('quote'),
    location: jsonb('location'),
    label: text('label').notNull(),
    mediaKind: citationMedia('media_kind').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('citations_section_id_idx').on(table.sectionId),
    index('citations_owner_id_idx').on(table.ownerId),
    index('citations_chunk_id_idx').on(table.chunkId),
    index('citations_resource_id_idx').on(table.resourceId),
    check(
      'citations_quote_length_check',
      sql`${table.quote} is null or char_length(${table.quote}) <= 2000`,
    ),
    check(
      'citations_location_check',
      sql`${table.location} is null or jsonb_typeof(${table.location}) = 'object'`,
    ),
    check('citations_label_length_check', sql`char_length(${table.label}) between 1 and 120`),
  ],
);

/** BR-COU-11 — reading progress of a chapter, per course version. */
export const readingProgress = pgTable(
  'reading_progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    percent: smallint('percent').notNull().default(0),
    secondsSpent: integer('seconds_spent').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.courseId, table.chapterId] }),
    check('reading_progress_percent_check', sql`${table.percent} between 0 and 100`),
    check('reading_progress_seconds_spent_check', sql`${table.secondsSpent} >= 0`),
  ],
);

/** BR-COU-08 — the learner rewrites a chapter summary; the tutor gives structured feedback. */
export const chapterSummaries = pgTable(
  'chapter_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    /** ADR-0113 — the course version used to write the summary. */
    courseId: uuid('course_id').references(() => courses.id, { onDelete: 'set null' }),
    text: text('text').notNull(),
    feedback: jsonb('feedback').$type<ChapterSummaryFeedback>(),
    /** ET-2 — a replayed submission returns the first summary instead of duplicating it. */
    requestKey: text('request_key'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('chapter_summaries_user_chapter_idx').on(
      table.userId,
      table.chapterId,
      table.createdAt.desc(),
    ),
    uniqueIndex('chapter_summaries_request_key_idx')
      .on(table.userId, table.requestKey)
      .where(sql`${table.requestKey} is not null`),
    check(
      'chapter_summaries_text_length_check',
      sql`char_length(${table.text}) between 1 and 2000`,
    ),
    check(
      'chapter_summaries_feedback_check',
      sql`${table.feedback} is null or jsonb_typeof(${table.feedback}) = 'object'`,
    ),
    check(
      'chapter_summaries_request_key_check',
      sql`${table.requestKey} is null or ${table.requestKey} ~ '^[A-Za-z0-9_-]{8,128}$'`,
    ),
  ],
);

/** ADR-0040 — one conversation per opening, kept and private; a new discussion adds a row. */
export const tutorConversations = pgTable(
  'tutor_conversations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    /** SPEC-610 — chapter opened when the discussion started (ADR-0040). */
    chapterId: uuid('chapter_id').references(() => chapters.id, { onDelete: 'cascade' }),
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tutor_conversations_user_course_idx').on(
      table.userId,
      table.courseId,
      table.createdAt.desc(),
    ),
    index('tutor_conversations_chapter_idx').on(table.chapterId),
    check(
      'tutor_conversations_title_length_check',
      sql`${table.title} is null or char_length(${table.title}) <= 200`,
    ),
  ],
);

/** ADR-0040, BR-TUT-07 — ordered messages, with the sources used and an optional self-test. */
export const tutorMessages = pgTable(
  'tutor_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => tutorConversations.id, { onDelete: 'cascade' }),
    /** ADR-0113 — direct scope for RLS; must match the conversation owner (EF-7). */
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: messageRole('role').notNull(),
    content: text('content').notNull(),
    context: jsonb('context'),
    sources: jsonb('sources')
      .$type<TutorMessageSource[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    followUps: text('follow_ups')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    selfTest: jsonb('self_test').$type<SelfTest>(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('tutor_messages_conversation_idx').on(table.conversationId, table.createdAt, table.id),
    index('tutor_messages_user_id_idx').on(table.userId),
    check(
      'tutor_messages_content_length_check',
      sql`char_length(${table.content}) between 1 and 20000`,
    ),
    check(
      'tutor_messages_context_check',
      sql`${table.context} is null or jsonb_typeof(${table.context}) = 'object'`,
    ),
    check('tutor_messages_sources_check', sql`jsonb_typeof(${table.sources}) = 'array'`),
    check(
      'tutor_messages_self_test_check',
      sql`${table.selfTest} is null or jsonb_typeof(${table.selfTest}) = 'object'`,
    ),
  ],
);

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;
export type CourseSection = typeof courseSections.$inferSelect;
export type NewCourseSection = typeof courseSections.$inferInsert;
export type CourseSectionRevision = typeof courseSectionRevisions.$inferSelect;
export type NewCourseSectionRevision = typeof courseSectionRevisions.$inferInsert;
export type Citation = typeof citations.$inferSelect;
export type NewCitation = typeof citations.$inferInsert;
export type ReadingProgress = typeof readingProgress.$inferSelect;
export type NewReadingProgress = typeof readingProgress.$inferInsert;
export type CourseSectionReport = typeof courseSectionReports.$inferSelect;
export type NewCourseSectionReport = typeof courseSectionReports.$inferInsert;
export type ChapterSummary = typeof chapterSummaries.$inferSelect;
export type NewChapterSummary = typeof chapterSummaries.$inferInsert;
export type TutorConversation = typeof tutorConversations.$inferSelect;
export type NewTutorConversation = typeof tutorConversations.$inferInsert;
export type TutorMessage = typeof tutorMessages.$inferSelect;
export type NewTutorMessage = typeof tutorMessages.$inferInsert;
export type CourseStatus = (typeof COURSE_STATUSES)[number];
export type SectionKind = (typeof SECTION_KINDS)[number];
export type CitationMedia = (typeof CITATION_MEDIA)[number];
export type CourseSectionReportStatus = (typeof courseSectionReportStatus.enumValues)[number];
