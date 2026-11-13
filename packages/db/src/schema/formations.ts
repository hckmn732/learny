// Formation programme schema (SPEC-103 ET-1, ET-2; docs/architecture/data-model.md §2).
//
// The programme (modules, chapters, notions, programme links) belongs to the `formations` row and
// is shared by the members of a group (ADR-0035). Per-learner progress lives in `module_progress`
// and `chapter_progress`, keyed by user. Composite foreign keys guarantee that a notion always
// belongs to the chapter and module of its own formation; deferred unique constraints let a
// service swap two positions inside one transaction (EF-3).
//
// SQL that Drizzle cannot express lives in the custom migrations `formations_functions`
// (function used by a CHECK) and `formations_constraints` (RLS, triggers, deferred constraints,
// full-text index, `profiles.current_formation_id` foreign key).
import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { actor, courseLanguage, jobStatus } from './enums';
import type {
  CadrageProfile,
  CadrageSuggestions,
  ExamFormat,
  StudyOverride,
} from './formations.json-schemas';
import { profiles } from './identity';

/** BR-FOR-03 — why the learner follows the formation. */
export const formationObjective = pgEnum('formation_objective', [
  'operational',
  'exam',
  'dialogue',
  'project',
]);

/** BR-FOR-01, BR-FOR-11, BR-FOR-12 — lifecycle of a formation. */
export const formationStatus = pgEnum('formation_status', [
  'cadrage',
  'programme_proposed',
  'active',
  'paused',
  'completed',
  'archived',
]);

/** BR-FOR-12 — memory interview after completion (ADR-0015). */
export const maintenanceMode = pgEnum('maintenance_mode', ['light', 'stopped']);

/** ADR-0162 — stable visual accent of a formation (SPEC-603 ET-6). */
export const formationAccent = pgEnum('formation_accent', [
  'indigo',
  'green',
  'orange',
  'violet',
  'teal',
]);

/** Cadrage is a conversation between the tutor and the learner. */
export const messageRole = pgEnum('message_role', ['tutor', 'learner']);

/** BR-FOR-02 — keys collected during the cadrage. */
export const cadrageKey = pgEnum('cadrage_key', [
  'scope',
  'starting_point',
  'target_level',
  'volume',
  'dates',
  'other',
]);

/** BR-FOR-04 — a programme is proposed by the tutor or imported by the learner. */
export const importKind = pgEnum('import_kind', ['file', 'text']);

/** BR-FOR-07 — module status (mirror of the owner's `module_progress`). */
export const moduleStatus = pgEnum('module_status', ['locked', 'open', 'validated']);

/** BR-APP-04 — per-chapter contributions status. */
export const contribStatus = pgEnum('contrib_status', ['in_progress', 'done']);

/** Notion graph links (ADR-0036, SPEC-616). */
export const linkKind = pgEnum('link_kind', ['prerequisite', 'confusion', 'tutor']);

export const FORMATION_OBJECTIVES = formationObjective.enumValues;
export const FORMATION_STATUSES = formationStatus.enumValues;
export const FORMATION_ACCENTS = formationAccent.enumValues;
export const MAINTENANCE_MODES = maintenanceMode.enumValues;
export const MESSAGE_ROLES = messageRole.enumValues;
export const CADRAGE_KEYS = cadrageKey.enumValues;
export const IMPORT_KINDS = importKind.enumValues;
export const MODULE_STATUSES = moduleStatus.enumValues;
export const CONTRIB_STATUSES = contribStatus.enumValues;
export const LINK_KINDS = linkKind.enumValues;

/** BR-FOR-09, BR-FOR-16 — a formation and its programme. */
export const formations = pgTable(
  'formations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    /** Foreign key to `groups` added by SPEC-111. */
    groupId: uuid('group_id'),
    title: text('title').notNull(),
    /** ADR-0162 — at most three characters; empty means the computed fallback applies. */
    monogram: text('monogram').notNull().default(''),
    /** ADR-0162 — stable accent of the cards and progress rings. */
    accentColor: formationAccent('accent_color').notNull().default('indigo'),
    description: text('description'),
    objectives: formationObjective('objectives')
      .array()
      .notNull()
      .default(sql`'{}'::public.formation_objective[]`),
    status: formationStatus('status').notNull().default('cadrage'),
    cadrageProfile: jsonb('cadrage_profile').$type<CadrageProfile>().notNull().default({}),
    volumeHours: smallint('volume_hours'),
    startDate: date('start_date', { mode: 'string' }),
    endDate: date('end_date', { mode: 'string' }),
    studyOverride: jsonb('study_override').$type<StudyOverride>(),
    defaultThreshold: smallint('default_threshold').notNull().default(80),
    examFormat: jsonb('exam_format').$type<ExamFormat>(),
    maintenanceMode: maintenanceMode('maintenance_mode'),
    courseLanguage: courseLanguage('course_language').notNull().default('fr'),
    lastOpenedAt: timestamp('last_opened_at', { withTimezone: true }),
    pausedAt: timestamp('paused_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('formations_owner_status_idx').on(table.ownerId, table.status),
    index('formations_group_id_idx')
      .on(table.groupId)
      .where(sql`${table.groupId} is not null`),
    check('formations_monogram_length_check', sql`char_length(${table.monogram}) <= 3`),
    check('formations_title_length_check', sql`char_length(${table.title}) between 1 and 120`),
    check('formations_monogram_length_check', sql`char_length(${table.monogram}) <= 3`),
    check('formations_description_length_check', sql`char_length(${table.description}) <= 2000`),
    check(
      'formations_cadrage_profile_check',
      sql`jsonb_typeof(${table.cadrageProfile}) = 'object'`,
    ),
    check('formations_volume_hours_check', sql`${table.volumeHours} between 1 and 2000`),
    check(
      'formations_study_override_check',
      sql`${table.studyOverride} is null or jsonb_typeof(${table.studyOverride}) = 'object'`,
    ),
    check('formations_default_threshold_check', sql`${table.defaultThreshold} between 60 and 95`),
    check(
      'formations_exam_format_check',
      sql`${table.examFormat} is null or jsonb_typeof(${table.examFormat}) = 'object'`,
    ),
    check(
      'formations_dates_order',
      sql`${table.endDate} is null or ${table.startDate} is null or ${table.endDate} >= ${table.startDate}`,
    ),
    // BR-FOR-03: one objective at least as soon as the formation leaves the cadrage step.
    check(
      'formations_objectives_required',
      sql`${table.status} = 'cadrage' or cardinality(${table.objectives}) >= 1`,
    ),
    check(
      'formations_objectives_unique',
      sql`public.enum_array_is_set(${table.objectives}::text[])`,
    ),
    check(
      'formations_maintenance_only_completed',
      sql`${table.maintenanceMode} is null or ${table.status} = 'completed'`,
    ),
  ],
);

/** BR-FOR-02 — cadrage conversation history. */
export const cadrageMessages = pgTable(
  'cadrage_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    formationId: uuid('formation_id')
      .notNull()
      .references(() => formations.id, { onDelete: 'cascade' }),
    /** ADR-0113 — direct RLS scope without joining the formation. */
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    role: messageRole('role').notNull(),
    content: text('content').notNull(),
    questionKey: cadrageKey('question_key'),
    suggestions: jsonb('suggestions').$type<CadrageSuggestions>(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('cadrage_messages_formation_id_position_unique').on(table.formationId, table.position),
    index('cadrage_messages_user_id_idx').on(table.userId),
    check(
      'cadrage_messages_content_length_check',
      sql`char_length(${table.content}) between 1 and 4000`,
    ),
    check(
      'cadrage_messages_suggestions_check',
      sql`${table.suggestions} is null or jsonb_typeof(${table.suggestions}) = 'array'`,
    ),
    check('cadrage_messages_position_check', sql`${table.position} >= 1`),
  ],
);

/** BR-FOR-04 — imported programme (file or pasted text). */
export const programmeImports = pgTable(
  'programme_imports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    formationId: uuid('formation_id')
      .notNull()
      .references(() => formations.id, { onDelete: 'cascade' }),
    /** ADR-0113 — direct RLS scope without joining the formation. */
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    sourceKind: importKind('source_kind').notNull(),
    /** Foreign key to `resources` added by SPEC-104. */
    resourceId: uuid('resource_id'),
    rawText: text('raw_text'),
    parsed: jsonb('parsed'),
    status: jobStatus('status').notNull().default('queued'),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('programme_imports_user_id_idx').on(table.userId),
    check('programme_imports_raw_text_length_check', sql`char_length(${table.rawText}) <= 200000`),
    check('programme_imports_error_length_check', sql`char_length(${table.error}) <= 2000`),
    check(
      'programme_imports_source_kind_check',
      sql`(${table.sourceKind} = 'text') = (${table.rawText} is not null)`,
    ),
  ],
);

/** BR-FOR-04 — learner request to adjust the programme (« Ajuster avec le tuteur »). */
export const programmeChangeRequests = pgTable(
  'programme_change_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    formationId: uuid('formation_id')
      .notNull()
      .references(() => formations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    message: text('message').notNull(),
    status: jobStatus('status').notNull().default('queued'),
    resultSummary: text('result_summary'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('programme_change_requests_user_id_idx').on(table.userId),
    check(
      'programme_change_requests_message_length_check',
      sql`char_length(${table.message}) between 1 and 2000`,
    ),
    check(
      'programme_change_requests_result_summary_length_check',
      sql`char_length(${table.resultSummary}) <= 4000`,
    ),
  ],
);

/** BR-FOR-05 — ordered modules of a programme. */
export const modules = pgTable(
  'modules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    formationId: uuid('formation_id')
      .notNull()
      .references(() => formations.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    title: text('title').notNull(),
    objectives: text('objectives')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    plannedStart: date('planned_start', { mode: 'string' }),
    plannedEnd: date('planned_end', { mode: 'string' }),
    threshold: smallint('threshold').notNull().default(80),
    status: moduleStatus('status').notNull().default('locked'),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('modules_id_formation_id_unique').on(table.id, table.formationId),
    unique('modules_position_unique').on(table.formationId, table.position),
    check('modules_position_check', sql`${table.position} >= 1`),
    check('modules_title_length_check', sql`char_length(${table.title}) between 1 and 160`),
    check('modules_threshold_check', sql`${table.threshold} between 60 and 95`),
    check(
      'modules_planned_dates_check',
      sql`${table.plannedEnd} is null or ${table.plannedStart} is null or ${table.plannedEnd} >= ${table.plannedStart}`,
    ),
  ],
);

/** BR-FOR-05 — ordered chapters of a module (`formation_id` avoids a join in RLS). */
export const chapters = pgTable(
  'chapters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    moduleId: uuid('module_id').notNull(),
    formationId: uuid('formation_id').notNull(),
    position: smallint('position').notNull(),
    title: text('title').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('chapters_id_module_id_unique').on(table.id, table.moduleId),
    unique('chapters_position_unique').on(table.moduleId, table.position),
    foreignKey({
      name: 'chapters_module_id_formation_id_fk',
      columns: [table.moduleId, table.formationId],
      foreignColumns: [modules.id, modules.formationId],
    }).onDelete('cascade'),
    index('chapters_formation_id_idx').on(table.formationId),
    check('chapters_position_check', sql`${table.position} >= 1`),
    check('chapters_title_length_check', sql`char_length(${table.title}) between 1 and 160`),
  ],
);

/** BR-APP-04 — personal contributions status of a chapter. */
export const chapterProgress = pgTable(
  'chapter_progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    chapterId: uuid('chapter_id')
      .notNull()
      .references(() => chapters.id, { onDelete: 'cascade' }),
    contributionsStatus: contribStatus('contributions_status').notNull().default('in_progress'),
    doneAt: timestamp('done_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.chapterId] }),
    index('chapter_progress_chapter_id_idx').on(table.chapterId),
    check(
      'chapter_progress_done_at_check',
      sql`(${table.contributionsStatus} = 'done') = (${table.doneAt} is not null)`,
    ),
  ],
);

/** BR-FOR-07, ADR-0035 — personal module progress; `modules.status` mirrors the owner's row. */
export const moduleProgress = pgTable(
  'module_progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    moduleId: uuid('module_id')
      .notNull()
      .references(() => modules.id, { onDelete: 'cascade' }),
    status: moduleStatus('status').notNull().default('locked'),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    validatedAt: timestamp('validated_at', { withTimezone: true }),
    bestScore: numeric('best_score', { precision: 5, scale: 2 }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.moduleId] }),
    index('module_progress_module_id_idx').on(table.moduleId),
    check('module_progress_best_score_check', sql`${table.bestScore} between 0 and 100`),
    check(
      'module_progress_validated_at_check',
      sql`${table.status} <> 'validated' or ${table.validatedAt} is not null`,
    ),
  ],
);

/** BR-FOR-05 — notions of a chapter, always inside the module and formation of that chapter. */
export const notions = pgTable(
  'notions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    formationId: uuid('formation_id').notNull(),
    moduleId: uuid('module_id').notNull(),
    chapterId: uuid('chapter_id').notNull(),
    label: text('label').notNull(),
    shortDefinition: text('short_definition'),
    position: smallint('position').notNull().default(1),
    createdBy: actor('created_by').notNull().default('tutor'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('notions_position_unique').on(table.chapterId, table.position),
    foreignKey({
      name: 'notions_module_id_formation_id_fk',
      columns: [table.moduleId, table.formationId],
      foreignColumns: [modules.id, modules.formationId],
    }).onDelete('cascade'),
    foreignKey({
      name: 'notions_chapter_id_module_id_fk',
      columns: [table.chapterId, table.moduleId],
      foreignColumns: [chapters.id, chapters.moduleId],
    }).onDelete('cascade'),
    index('notions_formation_id_idx').on(table.formationId),
    index('notions_module_id_idx').on(table.moduleId),
    check('notions_label_length_check', sql`char_length(${table.label}) between 1 and 120`),
    check(
      'notions_short_definition_length_check',
      sql`char_length(${table.shortDefinition}) <= 400`,
    ),
    check('notions_position_check', sql`${table.position} >= 1`),
  ],
);

/**
 * Notion graph. Programme links have a null `owner_id`; personal links (e.g. a confusion detected
 * for one learner) carry the learner. The `notion_links_validate` trigger refuses cross-formation
 * links and programme prerequisite cycles (custom migration `formations_constraints`).
 */
export const notionLinks = pgTable(
  'notion_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    formationId: uuid('formation_id')
      .notNull()
      .references(() => formations.id, { onDelete: 'cascade' }),
    fromNotionId: uuid('from_notion_id')
      .notNull()
      .references(() => notions.id, { onDelete: 'cascade' }),
    toNotionId: uuid('to_notion_id')
      .notNull()
      .references(() => notions.id, { onDelete: 'cascade' }),
    kind: linkKind('kind').notNull(),
    ownerId: uuid('owner_id').references(() => profiles.id, { onDelete: 'cascade' }),
    rationale: text('rationale'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('notion_links_unique')
      .on(table.fromNotionId, table.toNotionId, table.kind, table.ownerId)
      .nullsNotDistinct(),
    check('notion_links_no_self', sql`${table.fromNotionId} <> ${table.toNotionId}`),
    check(
      'notion_links_confusion_canonical',
      sql`${table.kind} <> 'confusion' or ${table.fromNotionId} < ${table.toNotionId}`,
    ),
    check('notion_links_rationale_length_check', sql`char_length(${table.rationale}) <= 500`),
    index('notion_links_formation_id_idx').on(table.formationId),
    index('notion_links_to_idx').on(table.toNotionId),
    index('notion_links_owner_id_idx')
      .on(table.ownerId)
      .where(sql`${table.ownerId} is not null`),
  ],
);

export type Formation = typeof formations.$inferSelect;
export type NewFormation = typeof formations.$inferInsert;
export type Module = typeof modules.$inferSelect;
export type NewModule = typeof modules.$inferInsert;
export type Chapter = typeof chapters.$inferSelect;
export type NewChapter = typeof chapters.$inferInsert;
export type Notion = typeof notions.$inferSelect;
export type NewNotion = typeof notions.$inferInsert;
export type NotionLink = typeof notionLinks.$inferSelect;
export type NewNotionLink = typeof notionLinks.$inferInsert;
export type ModuleProgress = typeof moduleProgress.$inferSelect;
export type NewModuleProgress = typeof moduleProgress.$inferInsert;
export type ChapterProgress = typeof chapterProgress.$inferSelect;
export type NewChapterProgress = typeof chapterProgress.$inferInsert;
export type CadrageMessage = typeof cadrageMessages.$inferSelect;
export type NewCadrageMessage = typeof cadrageMessages.$inferInsert;
export type ProgrammeImport = typeof programmeImports.$inferSelect;
export type NewProgrammeImport = typeof programmeImports.$inferInsert;
export type ProgrammeChangeRequest = typeof programmeChangeRequests.$inferSelect;
export type NewProgrammeChangeRequest = typeof programmeChangeRequests.$inferInsert;
