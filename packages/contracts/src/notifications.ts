import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';
import { EVENT_NOTIFICATION_TYPES } from './events';

// Contracts of the unified notification service (SPEC-209 ET-1, §10). The service is the single
// entry point of every notification producer: the in-app row is always created, then each external
// channel is decided by `decideDelivery` (ADR-0214, ADR-0265).

export const NotificationType = z.enum(EVENT_NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof NotificationType>;

export const DELIVERY_CHANNELS = ['email', 'push'] as const;
export const DeliveryChannel = z.enum(DELIVERY_CHANNELS);
export type DeliveryChannel = z.infer<typeof DeliveryChannel>;

export const DELIVERY_STATUSES = [
  'scheduled',
  'sent',
  'deferred_quiet',
  'capped',
  'failed',
  'skipped_pref',
] as const;
export const DeliveryStatus = z.enum(DELIVERY_STATUSES);
export type DeliveryStatus = z.infer<typeof DeliveryStatus>;

/** ET-1 — the input of `notify`: an event payload, never a rendered notification. */
export const NotifyInput = z.object({
  userId: Uuid,
  type: NotificationType,
  formationId: Uuid.nullable().optional(),
  data: z.record(z.string(), z.unknown()),
  /** EF-1, CL-4 — at most 200 characters; the same key never creates a second notification. */
  dedupeKey: z.string().trim().min(1).max(200).optional(),
  /** EF-2 — a future instant schedules the external deliveries instead of sending them. */
  eligibleAt: IsoDateTime.optional(),
  /** BR-NOT-06 — after this instant a deferred delivery is abandoned (CL-5). */
  staleAt: IsoDateTime.optional(),
});
export type NotifyInput = z.infer<typeof NotifyInput>;

export const NotifyDelivery = z.object({
  channel: DeliveryChannel,
  status: DeliveryStatus,
  /** ISO 8601 instant of the next re-evaluation, or null. */
  scheduledFor: IsoDateTime.nullable(),
});
export type NotifyDelivery = z.infer<typeof NotifyDelivery>;

export const NotifyResult = z.object({
  notificationId: Uuid,
  /** False when the dedupe key already existed: no new row and no new delivery. */
  created: z.boolean(),
  deliveries: z.array(NotifyDelivery),
});
export type NotifyResult = z.infer<typeof NotifyResult>;

/** EF-8 — settings simulated by the demonstration page. */
export const DevNotifySettings = z.object({
  channelEmail: z.boolean(),
  channelPush: z.boolean(),
  typeRevision: z.boolean(),
  typeValidation: z.boolean(),
  typeCourse: z.boolean(),
  typeGap: z.boolean(),
  typePlanning: z.boolean(),
  typeRelaunch: z.boolean(),
  quietStart: z.string().regex(/^\d{2}:\d{2}$/),
  quietEnd: z.string().regex(/^\d{2}:\d{2}$/),
  weekendQuiet: z.boolean(),
  maxPerDay: z.union([z.literal(3), z.literal(5), z.literal(8)]),
});
export type DevNotifySettings = z.infer<typeof DevNotifySettings>;

export const DevNotifyInput = z.object({
  type: NotificationType,
  tone: z.enum(['vous', 'tu']),
  /** Simulated instant of the notification (canonical UTC ISO 8601). */
  at: IsoDateTime,
  settings: DevNotifySettings,
  dedupeKey: z.string().trim().min(1).max(200).optional(),
});
export type DevNotifyInput = z.infer<typeof DevNotifyInput>;

export const DevNotifyOutput = z.object({
  notification: z.object({
    id: Uuid,
    type: NotificationType,
    icon: z.string(),
    title: z.string(),
    body: z.string(),
    href: z.string(),
    createdAt: IsoDateTime,
  }),
  created: z.boolean(),
  deliveries: z.array(
    z.object({
      channel: DeliveryChannel,
      status: DeliveryStatus,
      scheduledFor: IsoDateTime.nullable(),
      error: z.string().nullable(),
    }),
  ),
  digest: z.object({
    heldCount: z.number().int().min(0),
    heldMaxPerDay: z.union([z.literal(3), z.literal(5), z.literal(8)]),
    heldTitles: z.array(z.string()),
  }),
});
export type DevNotifyOutput = z.infer<typeof DevNotifyOutput>;

// SPEC-306 — inbox panel of the header bell (BR-NOT-01). The service groups each row in the
// learner's IANA zone with the injected clock, so the browser never guesses a day boundary from
// UTC (ET-3). One page of rows is enough for the panel; the filter and the counters are computed
// from the same authenticated snapshot.

export const NOTIFICATION_FILTERS = ['all', 'unread'] as const;
export const NotificationFilter = z.enum(NOTIFICATION_FILTERS);
export type NotificationFilter = z.infer<typeof NotificationFilter>;

/** BR-NOT-01 — the three groups of the mockup, already resolved in the profile time zone. */
export const NOTIFICATION_GROUPS = ['today', 'yesterday', 'earlier'] as const;
export const NotificationGroup = z.enum(NOTIFICATION_GROUPS);
export type NotificationGroup = z.infer<typeof NotificationGroup>;

export const NotificationItem = z.object({
  id: Uuid,
  type: NotificationType,
  icon: z.string().min(1).max(40),
  title: z.string().min(1).max(120),
  body: z.string().min(1).max(400),
  /** Internal relative path of the target screen, validated by the database constraint. */
  href: z.string().min(1).max(2048).startsWith('/'),
  /** Formation name shown under the body, or null when the notification has no formation. */
  formationTitle: z.string().min(1).max(120).nullable(),
  createdAt: IsoDateTime,
  readAt: IsoDateTime.nullable(),
  group: NotificationGroup,
});
export type NotificationItem = z.infer<typeof NotificationItem>;

/** Query of the paginated inbox read (ET-1): `filter=all|unread`, offset and bounded limit. */
export const NotificationListQuery = z.object({
  filter: NotificationFilter.default('all'),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export type NotificationListQuery = z.infer<typeof NotificationListQuery>;

export const NotificationListDto = z.object({
  items: z.array(NotificationItem),
  /** All notifications of the learner, regardless of the current filter. */
  total: z.number().int().min(0),
  /** Unread notifications of the learner, regardless of the current filter (EF-2). */
  unreadCount: z.number().int().min(0),
  /** IANA zone used for grouping and for the hour of each row (ET-3, ET-5). */
  timezone: z.string().min(1),
});
export type NotificationListDto = z.infer<typeof NotificationListDto>;

export const NotificationUnreadCountDto = z.object({
  count: z.number().int().min(0),
});
export type NotificationUnreadCountDto = z.infer<typeof NotificationUnreadCountDto>;

/** Answer of both idempotent read mutations: the remaining unread count (EF-3). */
export const NotificationReadDto = z.object({
  unreadCount: z.number().int().min(0),
});
export type NotificationReadDto = z.infer<typeof NotificationReadDto>;

export const notificationReadParams = z.object({ id: Uuid });

/** ET-1 — paginated inbox of the authenticated learner, newest first. */
export const notificationsList = defineRoute({
  id: 'notifications.list',
  method: 'GET',
  path: '/api/v1/notifications',
  auth: 'user',
  query: NotificationListQuery,
  output: NotificationListDto,
  successStatus: 200,
  summary:
    'Notifications du seul utilisateur connecté, triées de la plus récente à la plus ancienne et groupées dans son fuseau (SPEC-306).',
  errors: ['UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR'],
});

/** ET-1 — the badge count, an integer that is never negative. */
export const notificationsUnreadCount = defineRoute({
  id: 'notifications.unreadCount',
  method: 'GET',
  path: '/api/v1/notifications/unread-count',
  auth: 'user',
  output: NotificationUnreadCountDto,
  successStatus: 200,
  summary: 'Nombre de notifications non lues du seul utilisateur connecté (SPEC-306).',
  errors: ['UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR'],
});

/** ET-2, CL-1 — marking one owned notification read; repeated calls write nothing more. */
export const notificationRead = defineRoute({
  id: 'notifications.read',
  method: 'POST',
  path: '/api/v1/notifications/:id/read',
  auth: 'user',
  params: notificationReadParams,
  output: NotificationReadDto,
  successStatus: 200,
  summary:
    'Marque lue une notification du seul utilisateur connecté et renvoie le compteur (SPEC-306).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'UNAUTHENTICATED', 'INTERNAL_ERROR'],
});

/** ET-2, EF-3 — one idempotent call for the whole list; a second call creates no write. */
export const notificationsReadAll = defineRoute({
  id: 'notifications.readAll',
  method: 'POST',
  path: '/api/v1/notifications/read-all',
  auth: 'user',
  output: NotificationReadDto,
  successStatus: 200,
  summary:
    'Marque lues toutes les notifications du seul utilisateur connecté, sans écriture au-delà de la première (SPEC-306).',
  errors: ['UNAUTHENTICATED', 'NOT_FOUND', 'INTERNAL_ERROR'],
});

export const notificationRoutes = {
  notificationsList,
  notificationsUnreadCount,
  notificationRead,
  notificationsReadAll,
} as const;

/** EF-8 — demonstration route: notify the signed-in learner with simulated settings and clock. */
export const devNotify = defineRoute({
  id: 'dev.notify',
  method: 'POST',
  path: '/api/v1/dev/sdd/notify',
  auth: 'user',
  body: DevNotifyInput,
  output: DevNotifyOutput,
  successStatus: 201,
  idempotent: true,
  summary: 'Route de démonstration : routage unifié d’une notification (SPEC-209).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'IDEMPOTENCY_IN_PROGRESS'],
});

export const notificationsDevRoutes = { devNotify } as const;
