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
