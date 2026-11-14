// Agenda, automation, streak and milestone schema (SPEC-108 EF-1 to EF-5, ET-1 to ET-5;
// docs/architecture/data-model.md §7, ADR-0029).
//
// `schedule_slots` keeps every planned session with the five statuses of BR-AGE-04; a moved session
// is never rewritten: the old row becomes `moved` and a new row points to it through
// `moved_from_id`, so the origin of a displacement stays auditable (EF-2). `automation_actions`
// journals what the tutor did with the learner's tone, its payload and the inverse payload needed
// by an undo (EF-3, BR-AUT-11). `daily_activity` keeps one row per local civil day; the day is
// computed by SPEC-207 and never by a SQL default (EF-4, ET-4). `milestones` records an achievement
// once (EF-5, CL-6).
//
// SQL that Drizzle cannot express lives in the custom migration `planning_rules`: RLS and owner
// policies (ET-3), the triggers that keep `updated_at` (ADR-0022) and check the origin of a move
// (EF-2). The unique index on `moved_from_id` (partial, active successors only) is declared here
// because Drizzle can express it; it is the SQL guarantee behind CL-2.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { activities } from './bricks-activities';
import { formations, modules } from './formations';
import { automationKey, profiles } from './identity';

/** EF-1 — the twelve kinds of activity a slot can reserve (`data-model.md` §7). */
export const slotKind = pgEnum('slot_kind', [
  'contributions',
  'course',
  'exercise',
  'validation_quiz',
  'global_quiz',
  'revision',
  'buffer',
  'sprint',
  'mock_exam',
  'warmup',
  'micro_session',
  'weekly_review',
]);

/** BR-AGE-04 — exactly one of the five states of a planned slot. */
export const slotStatus = pgEnum('slot_status', [
  'planned',
  'done',
  'missed',
  'moved',
  'cancelled',
]);

/** EF-1 — who wrote the slot. */
export const slotCreator = pgEnum('slot_creator', ['planner', 'automation', 'learner']);

/**
 * EF-3, BR-AUT-01 to BR-AUT-10 — the ten automations of V1 already declared with the identity schema
 * (SPEC-102, `identity.ts`) because `automation_settings` needs them; SPEC-108 reuses the same
 * enumeration for the action journal (ADR-0113).
 */
/** EF-3, BR-AUT-11 — lifecycle of an action proposed or applied by the tutor. */
export const automationStatus = pgEnum('automation_status', [
  'pending_consent',
  'applied',
  'declined',
  'undone',
  'expired',
  'consumed',
]);

/** EF-5 — the three milestones of V1. */
export const milestoneKey = pgEnum('milestone_key', [
  'module_validated',
  'notions_100',
  'streak_30',
]);

export const SLOT_KINDS = slotKind.enumValues;
export const SLOT_STATUSES = slotStatus.enumValues;
export const SLOT_CREATORS = slotCreator.enumValues;
export const AUTOMATION_STATUSES = automationStatus.enumValues;
export const MILESTONE_KEYS = milestoneKey.enumValues;
export type AutomationKey = (typeof automationKey.enumValues)[number];

/** EF-2 — only a slot that has not happened yet can be moved by the repository. */
export const MOVABLE_SLOT_STATUSES = ['planned', 'missed'] as const;

/** EF-2 — the statuses that still represent an active successor of a move (CL-2). */
export const ACTIVE_SLOT_STATUSES = ['planned', 'done', 'missed'] as const;

/** ET-1 — a canonical UTC instant (ISO 8601 with milliseconds and `Z`). */
export const planningInstantSchema = z.string().refine(
  (value) => {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString() === value;
  },
  { message: 'un instant UTC ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ) est attendu' },
);

/** ET-1, EF-4 — a civil local day, without any implicit SQL conversion. */
export const planningDaySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'une date civile YYYY-MM-DD est attendue' })
  .refine(
    (value) => {
      const [year, month, day] = value.split('-').map(Number);
      if (year === undefined || month === undefined || day === undefined) return false;
      const date = new Date(Date.UTC(year, month - 1, day));
      return (
        date.getUTCFullYear() === year &&
        date.getUTCMonth() === month - 1 &&
        date.getUTCDate() === day
      );
    },
    { message: 'la date civile n’existe pas' },
  );

/** EF-1, CL-1 — a slot starts strictly before it ends. */
export const slotWindowSchema = z
  .object({
    startsAt: planningInstantSchema,
    endsAt: planningInstantSchema,
  })
  .refine((value) => new Date(value.endsAt).getTime() > new Date(value.startsAt).getTime(), {
    path: ['endsAt'],
    message: 'la fin doit être strictement postérieure au début',
  });

/** EF-3, BR-AUT-11 — one line, in the learner's tone. */
export const automationSummarySchema = z
  .string()
  .min(1, { message: 'un résumé est attendu' })
  .max(300, { message: 'le résumé dépasse 300 caractères' })
  .refine((value) => !/[\r\n]/.test(value), {
    message: 'le résumé tient sur une seule ligne',
  });

/** EF-3, ET-5 — the JSON payload of an action and its inverse are objects. */
export const automationPayloadSchema = z.record(z.string(), z.unknown());

/** EF-4, ET-5 — event sources of a daily activity row, de-duplicated by the repository. */
export const activitySourcesSchema = z
  .array(z.string().min(1, { message: 'une source vide n’est pas acceptée' }).max(80))
  .max(50, { message: 'trop de sources pour une journée' });

/** EF-4 — non-negative minutes, integer. */
export const activityMinutesSchema = z
  .int()
  .min(0, { message: 'les minutes ne peuvent pas être négatives' });

/**
 * EF-1, EF-2 — one planned session. `moved_from_id` is a self-referencing foreign key with
 * `on delete no action`: deleting the origin alone is refused (CL-3), while deleting the account
 * removes the whole chain in a single statement. The partial unique index guarantees at most one
 * active successor per moved slot, which closes the concurrent-move race of CL-2 even for a direct
 * SQL writer.
 */
export const scheduleSlots = pgTable(
  'schedule_slots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    formationId: uuid('formation_id')
      .notNull()
      .references(() => formations.id, { onDelete: 'cascade' }),
    moduleId: uuid('module_id').references(() => modules.id, { onDelete: 'set null' }),
    kind: slotKind('kind').notNull(),
    title: text('title').notNull(),
    meta: text('meta'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: slotStatus('status').notNull().default('planned'),
    activityId: uuid('activity_id').references(() => activities.id, { onDelete: 'set null' }),
    createdBy: slotCreator('created_by').notNull(),
    movedFromId: uuid('moved_from_id'),
    /** Stable key of the computed slot, used by the idempotent plan reconciliation (ADR-0149). */
    plannerKey: text('planner_key'),
    groupMilestone: boolean('group_milestone').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // EF-6, ET-1 — the agenda reads one learner's slots ordered by start instant.
    index('schedule_slots_user_id_starts_at_idx').on(table.userId, table.startsAt),
    index('schedule_slots_formation_id_idx').on(table.formationId),
    index('schedule_slots_module_id_idx').on(table.moduleId),
    index('schedule_slots_activity_id_idx').on(table.activityId),
    // EF-2, CL-2 — a moved slot has at most one active successor.
    uniqueIndex('schedule_slots_moved_from_active_unique')
      .on(table.movedFromId)
      .where(
        sql`${table.movedFromId} is not null and ${table.status} in ('planned', 'done', 'missed')`,
      ),
    // SPEC-411 ET-3, ADR-0149 — one live planner slot per stable key; completed or moved
    // slots keep their key but leave the partial index, so a replacement can be planned.
    uniqueIndex('schedule_slots_planner_key_unique')
      .on(table.userId, table.plannerKey)
      .where(sql`${table.status} = 'planned' and ${table.plannerKey} is not null`),
    // ET-2, CL-3 — the origin is a slot; deleting it alone is refused.
    foreignKey({
      name: 'schedule_slots_moved_from_id_fk',
      columns: [table.movedFromId],
      foreignColumns: [table.id],
    }).onDelete('no action'),
    // EF-1, CL-1 — a slot ends strictly after it starts.
    check('schedule_slots_window_check', sql`${table.endsAt} > ${table.startsAt}`),
    // ET-2 — a slot never originates from itself.
    check(
      'schedule_slots_moved_from_not_self_check',
      sql`${table.movedFromId} is null or ${table.movedFromId} <> ${table.id}`,
    ),
    // EF-1, ET-2 — a title is required and stays a short label.
    check('schedule_slots_title_length_check', sql`char_length(${table.title}) between 1 and 200`),
    check(
      'schedule_slots_meta_length_check',
      sql`${table.meta} is null or char_length(${table.meta}) <= 1000`,
    ),
  ],
);

/**
 * EF-3, BR-AUT-11/12 — the automation journal, read from the most recent action to the oldest.
 * Creation is reserved to the automation service role; the learner only reads and decides
 * (accept, decline, undo). `payload` and `undo_payload` are validated as JSON objects by Zod before
 * they reach Postgres (ET-5).
 */
export const automationActions = pgTable(
  'automation_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    formationId: uuid('formation_id').references(() => formations.id, { onDelete: 'set null' }),
    automation: automationKey('automation').notNull(),
    kind: text('kind').notNull(),
    summary: text('summary').notNull(),
    payload: jsonb('payload')
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    undoPayload: jsonb('undo_payload').$type<Record<string, unknown>>(),
    requiresConsent: boolean('requires_consent').notNull().default(false),
    status: automationStatus('status').notNull().default('applied'),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // EF-3, ET-1 — the weekly journal reads one learner's actions, newest first.
    index('automation_actions_user_id_created_at_idx').on(table.userId, table.createdAt.desc()),
    index('automation_actions_formation_id_idx').on(table.formationId),
    check('automation_actions_kind_length_check', sql`char_length(${table.kind}) between 1 and 80`),
    // EF-3, ET-2, BR-AUT-11 — the summary is one non-empty line.
    check(
      'automation_actions_summary_check',
      sql`char_length(${table.summary}) between 1 and 300 and ${table.summary} !~ '[\\r\\n]'`,
    ),
    check('automation_actions_payload_check', sql`jsonb_typeof(${table.payload}) = 'object'`),
    check(
      'automation_actions_undo_payload_check',
      sql`${table.undoPayload} is null or jsonb_typeof(${table.undoPayload}) = 'object'`,
    ),
    // ET-2, BR-AUT-11 — only a consented action waits for consent; a decline is a decision.
    check(
      'automation_actions_pending_consent_check',
      sql`${table.status} <> 'pending_consent' or ${table.requiresConsent}`,
    ),
    check(
      'automation_actions_pending_decided_at_check',
      sql`${table.status} <> 'pending_consent' or ${table.decidedAt} is null`,
    ),
    check(
      'automation_actions_declined_decided_at_check',
      sql`${table.status} <> 'declined' or ${table.decidedAt} is not null`,
    ),
    // SPEC-711 ET-4, ADR-0190 — idempotence of the proposals: one action at most per
    // `(user_id, automation, payload->>'dedupeKey')`, for the rows that carry a key. A replayed
    // trigger or a redelivered event therefore creates no second action (CA-2, CL-2).
    uniqueIndex('automation_actions_dedupe_uq')
      .on(table.userId, table.automation, sql`(${table.payload} ->> 'dedupeKey')`)
      .where(sql`${table.payload} ? 'dedupeKey'`),
  ],
);

/**
 * EF-4, CL-5 — one row per `(user_id, day)`. `day` is a civil local date computed by SPEC-207; the
 * column has no default, so no server time zone can create an implicit day. The repository upsert
 * adds minutes atomically and de-duplicates event sources.
 */
export const dailyActivity = pgTable(
  'daily_activity',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    day: date('day', { mode: 'string' }).notNull(),
    minutes: integer('minutes').notNull().default(0),
    qualifying: boolean('qualifying').notNull().default(false),
    sources: text('sources')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
  },
  (table) => [
    primaryKey({ name: 'daily_activity_pkey', columns: [table.userId, table.day] }),
    check('daily_activity_minutes_check', sql`${table.minutes} >= 0`),
    check(
      'daily_activity_sources_check',
      sql`array_position(${table.sources}, null) is null and array_position(${table.sources}, '') is null`,
    ),
  ],
);

/**
 * EF-5, CL-6 — an achievement happens once. `nulls not distinct` makes the unique constraint cover
 * `streak_30`, whose `ref_id` is null; without it Postgres would accept the same milestone twice.
 */
export const milestones = pgTable(
  'milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    formationId: uuid('formation_id').references(() => formations.id, { onDelete: 'set null' }),
    key: milestoneKey('key').notNull(),
    refId: uuid('ref_id'),
    achievedAt: timestamp('achieved_at', { withTimezone: true }).notNull(),
  },
  (table) => [
    unique('milestones_user_id_key_ref_id_unique')
      .on(table.userId, table.key, table.refId)
      .nullsNotDistinct(),
    // EF-6 — the milestone list paginates newest first.
    index('milestones_user_id_achieved_at_idx').on(table.userId, table.achievedAt.desc()),
    index('milestones_formation_id_idx').on(table.formationId),
  ],
);

export type ScheduleSlot = typeof scheduleSlots.$inferSelect;
export type NewScheduleSlot = typeof scheduleSlots.$inferInsert;
export type AutomationAction = typeof automationActions.$inferSelect;
export type NewAutomationAction = typeof automationActions.$inferInsert;
export type DailyActivity = typeof dailyActivity.$inferSelect;
export type NewDailyActivity = typeof dailyActivity.$inferInsert;
export type Milestone = typeof milestones.$inferSelect;
export type NewMilestone = typeof milestones.$inferInsert;
export type SlotKind = (typeof SLOT_KINDS)[number];
export type SlotStatus = (typeof SLOT_STATUSES)[number];
export type SlotCreator = (typeof SLOT_CREATORS)[number];
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number];
export type MilestoneKey = (typeof MILESTONE_KEYS)[number];
