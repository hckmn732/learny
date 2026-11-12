// Notifications inbox and delivery journal schema (SPEC-109 EF-1 to EF-5, ET-1 to ET-5;
// docs/architecture/data-model.md §8, ADR-0031, ADR-0214).
//
// `notifications` is one learner's in-app inbox: a row exists even when both external channels
// are disabled (BR-NOT-03). `unique(user_id, dedupe_key)` makes an event idempotent while a null
// key leaves room for genuinely distinct events (EF-2, CL-1, CL-2). `notification_deliveries`
// records the decision taken for each external channel: scheduled, sent, deferred by quiet hours,
// capped by the daily limit, failed, or skipped because of a preference (EF-3). The journal is
// written by the notification service and only read by its owner (ET-4, ADR-0112).
//
// The `href` is an internal relative path: a notification can never open an external URL, much
// less a `javascript:` one (ET-2, CL-4). Title, body and dedupe key are bounded by the contract of
// the future notification service (SPEC-209 ET-2: title ≤ 120, body ≤ 400, dedupe key ≤ 200).
// SQL that Drizzle cannot express (RLS, the monotone delivery trigger) lives in the custom
// migration `notification_rules`.
import { sql } from 'drizzle-orm';
import { check, index, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { createdAt, id } from './columns';
import { formations } from './formations';
import { profiles } from './identity';

/** EF-1 — the sixteen notification types of `data-model.md` §8, in their normative order. */
export const notificationType = pgEnum('notification_type', [
  'validation_soon',
  'course_ready',
  'global_quiz_today',
  'new_gap',
  'session_planned',
  'module_validated',
  'session_to_reschedule',
  'weekly_review',
  'milestone',
  'ai_cost_alert',
  'ai_task_failed',
  'export_ready',
  'group_invitation',
  'daily_digest',
  'relaunch',
  'planning_adjusted',
]);

/** EF-3, ADR-0031 — only the two external channels consume the daily cap. */
export const deliveryChannel = pgEnum('delivery_channel', ['email', 'push']);

/** EF-3 — the six decisions of a delivery (ADR-0214). */
export const deliveryStatus = pgEnum('delivery_status', [
  'scheduled',
  'sent',
  'deferred_quiet',
  'capped',
  'failed',
  'skipped_pref',
]);

export const NOTIFICATION_TYPES = notificationType.enumValues;
export const DELIVERY_CHANNELS = deliveryChannel.enumValues;
export const DELIVERY_STATUSES = deliveryStatus.enumValues;

/** EF-4 — the two filters of the paginated inbox read. */
export const NOTIFICATION_FILTERS = ['all', 'unread'] as const;

/** EF-3 — statuses that carry a future re-evaluation instant. */
export const SCHEDULED_DELIVERY_STATUSES = ['scheduled', 'deferred_quiet'] as const;

/** EF-3 — statuses whose `error` may be set, always as a safe code (ET-5). */
export const ERROR_DELIVERY_STATUSES = ['failed', 'skipped_pref'] as const;

/**
 * ET-2, CL-4 — an internal relative path. A single leading slash forbids any scheme, the negative
 * lookahead forbids a protocol-relative URL, and whitespace, backslashes and control characters
 * are refused so a browser can never reinterpret the value as another origin.
 */
export const notificationHrefSchema = z
  .string()
  .min(1, { message: 'un chemin interne est attendu' })
  .max(2048, { message: 'le chemin dépasse 2 048 caractères' })
  .regex(/^\/(?!\/)[^\s\\]*$/u, { message: 'un chemin interne commençant par / est attendu' });

/** ET-2, SPEC-209 ET-2 — a non-empty title of at most 120 characters. */
export const notificationTitleSchema = z
  .string()
  .trim()
  .min(1, { message: 'un titre est attendu' })
  .max(120, { message: 'le titre dépasse 120 caractères' });

/** ET-2, SPEC-209 ET-2 — a non-empty body of at most 400 characters. */
export const notificationBodySchema = z
  .string()
  .trim()
  .min(1, { message: 'un texte est attendu' })
  .max(400, { message: 'le texte dépasse 400 caractères' });

/** EF-1 — the icon is a lowercase slug chosen by the template, never markup. */
export const notificationIconSchema = z
  .string()
  .regex(/^[a-z][a-z0-9-]{0,39}$/u, { message: 'une icône en minuscules est attendue' });

/** EF-2 — an optional event key, at most 200 characters, never empty. */
export const notificationDedupeKeySchema = z
  .string()
  .trim()
  .min(1, { message: 'une clé vide n’est pas acceptée' })
  .max(200, { message: 'la clé dépasse 200 caractères' });

/** ET-5 — a safe error code: no address, endpoint or token can ever be stored in `error`. */
export const deliveryErrorSchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/u, { message: 'un code d’erreur sûr est attendu' });

/** ET-1 — a canonical UTC instant (ISO 8601 with milliseconds and `Z`). */
export const notificationInstantSchema = z.string().refine(
  (value) => {
    const date = new Date(value);
    return !Number.isNaN(date.getTime()) && date.toISOString() === value;
  },
  { message: 'un instant UTC ISO 8601 (YYYY-MM-DDTHH:mm:ss.sssZ) est attendu' },
);

/**
 * EF-3, ET-5, CL-5 — the coherent state of one delivery, shared by the repository and the tests.
 * `sent` is the only status that carries `sent_at`; `capped` and `skipped_pref` never do. A
 * scheduled or quiet-deferred line carries the instant of its re-evaluation and an error code is
 * reserved to `failed`/`skipped_pref`.
 */
export const deliveryStateSchema = z
  .object({
    status: z.enum(DELIVERY_STATUSES),
    scheduledFor: z.date().nullable().optional(),
    sentAt: z.date().nullable().optional(),
    error: deliveryErrorSchema.nullable().optional(),
  })
  .superRefine((value, ctx) => {
    const scheduledFor = value.scheduledFor ?? null;
    const sentAt = value.sentAt ?? null;
    const error = value.error ?? null;
    if ((value.status === 'sent') !== (sentAt !== null)) {
      ctx.addIssue({
        code: 'custom',
        path: ['sentAt'],
        message: 'un statut « sent » exige un horodatage d’envoi, et lui seul en porte un',
      });
    }
    if (
      (value.status === 'scheduled' || value.status === 'deferred_quiet') &&
      scheduledFor === null
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['scheduledFor'],
        message: 'une livraison planifiée exige sa date de réévaluation',
      });
    }
    if (error !== null && value.status !== 'failed' && value.status !== 'skipped_pref') {
      ctx.addIssue({
        code: 'custom',
        path: ['error'],
        message: 'un code d’erreur est réservé aux statuts failed/skipped_pref',
      });
    }
  });

/**
 * EF-1, EF-2 — one visible notification. The unique constraint covers `(user_id, dedupe_key)`;
 * Postgres treats null keys as distinct, so an event without a key can still create several rows.
 */
export const notifications = pgTable(
  'notifications',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    formationId: uuid('formation_id').references(() => formations.id, { onDelete: 'set null' }),
    type: notificationType('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    href: text('href').notNull(),
    icon: text('icon').notNull(),
    dedupeKey: text('dedupe_key'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    // EF-2, CA-2, CL-1, CL-2 — one event, one notification per learner; null keys stay distinct.
    unique('notifications_user_id_dedupe_key_unique').on(table.userId, table.dedupeKey),
    // EF-5 — the paginated inbox reads the newest rows first.
    index('notifications_user_id_created_at_idx').on(table.userId, table.createdAt.desc()),
    // EF-5 — the unread badge counts only the rows whose `read_at` is null.
    index('notifications_user_id_unread_idx')
      .on(table.userId)
      .where(sql`${table.readAt} is null`),
    index('notifications_formation_id_idx').on(table.formationId),
    // ET-2, CL-4 — an internal path only: no scheme, no protocol-relative form, no whitespace.
    check(
      'notifications_href_check',
      sql`${table.href} like '/%' and ${table.href} not like '//%' and strpos(${table.href}, chr(92)) = 0 and ${table.href} !~ '[\\r\\n\\t ]' and char_length(${table.href}) between 1 and 2048`,
    ),
    // ET-2 — title and body are non-empty and bounded by the SPEC-209 contract.
    check(
      'notifications_title_check',
      sql`char_length(${table.title}) between 1 and 120 and btrim(${table.title}) <> ''`,
    ),
    check(
      'notifications_body_check',
      sql`char_length(${table.body}) between 1 and 400 and btrim(${table.body}) <> ''`,
    ),
    check('notifications_icon_check', sql`${table.icon} ~ '^[a-z][a-z0-9-]{0,39}$'`),
    // EF-2 — a present dedupe key is never empty and stays within the contract.
    check(
      'notifications_dedupe_key_check',
      sql`${table.dedupeKey} is null or (btrim(${table.dedupeKey}) <> '' and char_length(${table.dedupeKey}) <= 200)`,
    ),
  ],
);

/**
 * EF-3, ET-5 — the decision journal of one notification and one external channel. A notification
 * has at most one delivery per channel, so replaying the same event never duplicates the journal
 * (CL-1). `sent` is final and requires `sent_at`; a capped or skipped delivery never carries it.
 */
export const notificationDeliveries = pgTable(
  'notification_deliveries',
  {
    id: id(),
    notificationId: uuid('notification_id')
      .notNull()
      .references(() => notifications.id, { onDelete: 'cascade' }),
    channel: deliveryChannel('channel').notNull(),
    status: deliveryStatus('status').notNull(),
    scheduledFor: timestamp('scheduled_for', { withTimezone: true }),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    error: text('error'),
  },
  (table) => [
    // EF-3, CL-1 — at most one delivery per notification and channel.
    unique('notification_deliveries_notification_id_channel_unique').on(
      table.notificationId,
      table.channel,
    ),
    // EF-5, SPEC-209 EF-5 — the deferred job reads due deliveries by status and instant.
    index('notification_deliveries_status_scheduled_for_idx').on(table.status, table.scheduledFor),
    // EF-3, CL-5 — `sent` iff `sent_at`; capped and skipped never carry a send instant.
    check(
      'notification_deliveries_sent_at_check',
      sql`(${table.status} = 'sent') = (${table.sentAt} is not null)`,
    ),
    // EF-3, ADR-0214 — a scheduled or deferred delivery has its re-evaluation instant.
    check(
      'notification_deliveries_scheduled_for_check',
      sql`${table.status} not in ('scheduled', 'deferred_quiet') or ${table.scheduledFor} is not null`,
    ),
    // ET-5 — an error is a short safe code, only for a failed or skipped delivery.
    check(
      'notification_deliveries_error_check',
      sql`${table.error} is null or (${table.status} in ('failed', 'skipped_pref') and ${table.error} ~ '^[a-z][a-z0-9_]{0,63}$')`,
    ),
  ],
);

export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
export type NotificationDelivery = typeof notificationDeliveries.$inferSelect;
export type NewNotificationDelivery = typeof notificationDeliveries.$inferInsert;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type DeliveryChannel = (typeof DELIVERY_CHANNELS)[number];
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];
export type NotificationFilter = (typeof NOTIFICATION_FILTERS)[number];
