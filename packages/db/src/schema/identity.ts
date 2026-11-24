// Identity and preferences schema (SPEC-102 ET-1, ET-2, ET-5; docs/architecture/data-model.md §1).
//
// Profiles are created from `auth.users` by the `on_auth_user_created` trigger (custom migration
// `identity_triggers`). The foreign key to `auth.users` cannot be expressed in the Drizzle snapshot
// (the `auth` schema is owned by Supabase Auth), so it is declared in that custom migration too
// (ADR-0236). `profiles.current_formation_id` gets its foreign key from SPEC-103.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { courseLanguage } from './enums';

/** BR-ACC-05 — tutor tone. */
export const tutorTone = pgEnum('tutor_tone', ['vous', 'tu']);

/** Onboarding steps (SPEC-602). */
export const onboardingStep = pgEnum('onboarding_step', [
  'profil',
  'rythme',
  'ia',
  'rappels',
  'depart',
  'done',
]);

/** BR-ACC-08 — preferred study moments. */
export const studySlot = pgEnum('study_slot', ['matin', 'apres_midi', 'soir']);

/** BR-AUT-01 to BR-AUT-10 — automation keys, reused by SPEC-108. */
export const automationKey = pgEnum('automation_key', [
  'reprise',
  'micro_seance',
  'echauffement',
  'remediation',
  'jeu_lacune',
  'questions_cartes',
  'plafond_quiz',
  'sprint',
  'bilan',
  'pause',
]);

/** ADR-0016 — global pause lifecycle. */
export const pauseStatus = pgEnum('pause_status', ['active', 'ended', 'cancelled']);

export const TUTOR_TONES = tutorTone.enumValues;
export const ONBOARDING_STEPS = onboardingStep.enumValues;
export const STUDY_SLOTS = studySlot.enumValues;
export const AUTOMATION_KEYS = automationKey.enumValues;
export const PAUSE_STATUSES = pauseStatus.enumValues;

/** BR-ACC-12 — profile of a learner (one row per `auth.users` row). */
export const profiles = pgTable(
  'profiles',
  {
    id: uuid('id').primaryKey(),
    email: text('email').notNull().unique(),
    firstName: text('first_name'),
    lastName: text('last_name'),
    courseLanguage: courseLanguage('course_language').notNull().default('fr'),
    tutorTone: tutorTone('tutor_tone').notNull().default('vous'),
    timezone: text('timezone').notNull().default('Europe/Paris'),
    onboardingStep: onboardingStep('onboarding_step').notNull().default('profil'),
    onboardingCompletedAt: timestamp('onboarding_completed_at', { withTimezone: true }),
    termsVersion: text('terms_version'),
    termsAcceptedAt: timestamp('terms_accepted_at', { withTimezone: true }),
    /** Foreign key to `formations` added by SPEC-103. */
    currentFormationId: uuid('current_formation_id'),
    deletionRequestedAt: timestamp('deletion_requested_at', { withTimezone: true }),
    deletionScheduledFor: timestamp('deletion_scheduled_for', { withTimezone: true }),
    sidebarCollapsed: boolean('sidebar_collapsed').notNull().default(false),
    /** ADR-0113 — read by the `group_member_progress` view (SPEC-111), fed by SPEC-411. */
    streakDays: integer('streak_days').notNull().default(0),
    streakComputedOn: date('streak_computed_on', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('profiles_deletion_scheduled_for_idx')
      .on(table.deletionScheduledFor)
      .where(sql`${table.deletionScheduledFor} is not null`),
    check('profiles_first_name_length_check', sql`char_length(${table.firstName}) <= 60`),
    check('profiles_last_name_length_check', sql`char_length(${table.lastName}) <= 60`),
    check('profiles_streak_days_check', sql`${table.streakDays} >= 0`),
    check(
      'profiles_deletion_pair_check',
      sql`(${table.deletionRequestedAt} is null) = (${table.deletionScheduledFor} is null)`,
    ),
  ],
);

/** BR-ACC-08 — study rhythm, default of every new formation (SPEC-103). */
export const studyPreferences = pgTable(
  'study_preferences',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    hoursPerDay: smallint('hours_per_day').notNull().default(2),
    studyDays: smallint('study_days')
      .array()
      .notNull()
      .default(sql`'{1,2,3,4,5}'::smallint[]`),
    preferredSlots: studySlot('preferred_slots')
      .array()
      .notNull()
      .default(sql`'{soir}'::study_slot[]`),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check('study_preferences_hours_per_day_check', sql`${table.hoursPerDay} between 1 and 6`),
    check(
      'study_preferences_study_days_check',
      sql`cardinality(${table.studyDays}) between 1 and 7 and ${table.studyDays} <@ '{1,2,3,4,5,6,7}'::smallint[] and public.smallint_array_is_set(${table.studyDays})`,
    ),
    check(
      'study_preferences_preferred_slots_check',
      sql`cardinality(${table.preferredSlots}) between 1 and 3`,
    ),
  ],
);

/** BR-NOT-04, BR-NOT-05 — notification preferences. */
export const notificationSettings = pgTable(
  'notification_settings',
  {
    userId: uuid('user_id')
      .primaryKey()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    channelEmail: boolean('channel_email').notNull().default(true),
    channelPush: boolean('channel_push').notNull().default(true),
    typeRevision: boolean('type_revision').notNull().default(true),
    typeValidation: boolean('type_validation').notNull().default(true),
    typeCourse: boolean('type_course').notNull().default(true),
    typeGap: boolean('type_gap').notNull().default(true),
    typePlanning: boolean('type_planning').notNull().default(true),
    typeRelaunch: boolean('type_relaunch').notNull().default(true),
    digestTime: time('digest_time').notNull().default('08:00'),
    quietStart: time('quiet_start').notNull().default('21:00'),
    quietEnd: time('quiet_end').notNull().default('08:00'),
    weekendQuiet: boolean('weekend_quiet').notNull().default(true),
    maxPerDay: smallint('max_per_day').notNull().default(5),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [check('notification_settings_max_per_day_check', sql`${table.maxPerDay} in (3,5,8)`)],
);

/**
 * Push subscriptions (SPEC-205 for the browser, SPEC-3501 for the native channels).
 *
 * A row is either a Web Push subscription (`kind = 'webpush'`: an HTTPS endpoint and the two client
 * keys of `PushManager.subscribe()`) or a native device token (`kind = 'apns' | 'fcm'`: the token
 * `expo-notifications` hands to the application, ADR-3007). The additive migration of SPEC-3501
 * made the browser columns nullable and added the three native ones; the RLS policies are the ones
 * of SPEC-205 and did not change.
 */
export const pushSubscriptions = pgTable(
  'push_subscriptions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull().default('webpush'),
    endpoint: text('endpoint'),
    p256dh: text('p256dh'),
    auth: text('auth'),
    token: text('token'),
    platform: text('platform'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    failureCount: smallint('failure_count').notNull().default(0),
  },
  (table) => [
    index('push_subscriptions_user_id_idx').on(table.userId),
    // EF-4 — one endpoint per account for the browser channel (a second registration refreshes
    // the keys of the first, SPEC-205 EF-1). The global partial unique below keeps the neutral
    // refusal of SPEC-205 CL-3: an endpoint already used by another account is refused, never
    // silently shared.
    uniqueIndex('push_subscriptions_user_endpoint_key')
      .on(table.userId, table.endpoint)
      .where(sql`${table.kind} = 'webpush'`),
    uniqueIndex('push_subscriptions_endpoint_key')
      .on(table.endpoint)
      .where(sql`${table.kind} = 'webpush'`),
    // EF-4, CL-3 — the native uniqueness: one token per (account, channel). A reinstalled device
    // gets a new token and refreshes its row, never a duplicate delivery.
    uniqueIndex('push_subscriptions_user_token_key')
      .on(table.userId, table.kind, table.token)
      .where(sql`${table.kind} in ('apns', 'fcm')`),
    check('push_subscriptions_kind_check', sql`${table.kind} in ('webpush', 'apns', 'fcm')`),
    check(
      'push_subscriptions_endpoint_check',
      sql`${table.endpoint} is null or (${table.endpoint} like 'https://%' and char_length(${table.endpoint}) <= 2048)`,
    ),
    // ET-1 — the shape of a row follows its channel: the browser form carries an endpoint and
    // both keys, the native form carries a token and no browser material.
    check(
      'push_subscriptions_shape_check',
      sql`(
        ${table.kind} = 'webpush'
        and ${table.endpoint} is not null
        and ${table.p256dh} is not null
        and ${table.auth} is not null
        and ${table.token} is null
      ) or (
        ${table.kind} in ('apns', 'fcm')
        and ${table.token} is not null
        and char_length(${table.token}) between 16 and 512
        and ${table.endpoint} is null
        and ${table.p256dh} is null
        and ${table.auth} is null
        and (${table.platform} is null or ${table.platform} in ('ios', 'android'))
      )`,
    ),
    check('push_subscriptions_user_agent_check', sql`char_length(${table.userAgent}) <= 512`),
    check('push_subscriptions_failure_count_check', sql`${table.failureCount} >= 0`),
  ],
);

/** BR-AUT-01 to BR-AUT-10 — per-learner automation settings (defaults: EF-6 / ET-3). */
export const automationSettings = pgTable(
  'automation_settings',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    key: automationKey('key').notNull(),
    enabled: boolean('enabled').notNull().default(true),
    params: jsonb('params').$type<Record<string, unknown>>().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.key] }),
    check('automation_settings_params_check', sql`jsonb_typeof(${table.params}) = 'object'`),
  ],
);

/** ADR-0016, BR-AUT-10 — declared pause of the whole account. */
export const pauses = pgTable(
  'pauses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }).notNull(),
    diagnosticOnReturn: boolean('diagnostic_on_return').notNull().default(true),
    status: pauseStatus('status').notNull().default('active'),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('pauses_user_id_status_idx').on(table.userId, table.status),
    uniqueIndex('pauses_one_active_per_user')
      .on(table.userId)
      .where(sql`${table.status} = 'active'`),
    check('pauses_period_check', sql`${table.endsOn} >= ${table.startsOn}`),
    check(
      'pauses_ended_at_check',
      sql`(${table.status} = 'ended') = (${table.endedAt} is not null)`,
    ),
  ],
);

export type Profile = typeof profiles.$inferSelect;
export type NewProfile = typeof profiles.$inferInsert;
export type StudyPreferences = typeof studyPreferences.$inferSelect;
export type NewStudyPreferences = typeof studyPreferences.$inferInsert;
export type NotificationSettings = typeof notificationSettings.$inferSelect;
export type NewNotificationSettings = typeof notificationSettings.$inferInsert;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type AutomationSetting = typeof automationSettings.$inferSelect;
export type NewAutomationSetting = typeof automationSettings.$inferInsert;
export type Pause = typeof pauses.$inferSelect;
export type NewPause = typeof pauses.$inferInsert;
