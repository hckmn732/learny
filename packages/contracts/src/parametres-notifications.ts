import { z } from 'zod';

import { IsoDateTime } from './common';
import { defineRoute } from './define-route';

// Contracts of the Notifications tab of the settings screen (SPEC-708 EF-1 to EF-3, ET-3; BR-SET-03,
// BR-NOT-04). The stored row stays `notification_settings` (SPEC-102, SPEC-209): these schemas only
// rename it for the screen, keep the six type switches ordered like the mockup and make the
// application channel impossible to disable.

/** BR-SET-03 — the three channels of the mockup, in order. */
export const NOTIFICATION_CHANNEL_IDS = ['app', 'email', 'browser'] as const;
export const NotificationChannelId = z.enum(NOTIFICATION_CHANNEL_IDS);
export type NotificationChannelId = z.infer<typeof NotificationChannelId>;

/** BR-SET-03 — the six switches of « Ce qui vous est notifié », in mockup order. */
export const NOTIFICATION_TYPE_IDS = [
  'revision',
  'validation',
  'course',
  'gap',
  'planning',
  'relaunch',
] as const;
export const NotificationTypeId = z.enum(NOTIFICATION_TYPE_IDS);
export type NotificationTypeId = z.infer<typeof NotificationTypeId>;

/** CA-1 — the counter is always written « N sur 6 activés ». */
export const NOTIFICATION_TYPE_COUNT = NOTIFICATION_TYPE_IDS.length;

/** ET-3, CL-1 — a local clock time `HH:mm` (24-hour, two digits). */
export const QuietTime = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/u, { message: 'une heure HH:mm est attendue' });

/** BR-NOT-05 — the daily cap offered by the mockup. */
export const NOTIFICATION_MAX_PER_DAY = [3, 5, 8] as const;
export const NotificationMaxPerDay = z.union([z.literal(3), z.literal(5), z.literal(8)]);
export type NotificationMaxPerDay = z.infer<typeof NotificationMaxPerDay>;

/** EF-1 — the in-app channel is always on; e-mail and browser are configurable. */
export const NotificationChannels = z.object({
  app: z.literal(true),
  email: z.boolean(),
  browser: z.boolean(),
});
export type NotificationChannels = z.infer<typeof NotificationChannels>;

export const NotificationTypes = z.object({
  revision: z.boolean(),
  validation: z.boolean(),
  course: z.boolean(),
  gap: z.boolean(),
  planning: z.boolean(),
  relaunch: z.boolean(),
});
export type NotificationTypes = z.infer<typeof NotificationTypes>;

/**
 * ET-4, CL-5 — the quiet window as the screen displays it. `crossesMidnight` is derived from the
 * profile zone by SPEC-207 semantics; `empty` means `start = end`, i.e. no quiet hours at all.
 */
export const QuietHoursState = z.object({
  start: QuietTime,
  end: QuietTime,
  crossesMidnight: z.boolean(),
  empty: z.boolean(),
});
export type QuietHoursState = z.infer<typeof QuietHoursState>;

/** ET-3 — the normalised settings returned by both routes. */
export const NotificationSettingsDto = z.object({
  channels: NotificationChannels,
  types: NotificationTypes,
  /** BR-NOT-04, EF-3 — local time of the daily programme. */
  digestTime: QuietTime,
  quiet: QuietHoursState,
  /** BR-NOT-04, EF-3 — « Rien le week-end, sauf les révisions dues ». */
  weekendQuiet: z.boolean(),
  maxPerDay: NotificationMaxPerDay,
  /** CA-1 — number of active type switches, between 0 and 6. */
  activeTypeCount: z.number().int().min(0).max(NOTIFICATION_TYPE_COUNT),
  /** ET-3 — optimistic version, sent back as `expectedUpdatedAt`. */
  updatedAt: IsoDateTime,
});
export type NotificationSettingsDto = z.infer<typeof NotificationSettingsDto>;

const ChannelPatch = z
  .object({
    app: z.literal(true).optional(),
    email: z.boolean().optional(),
    browser: z.boolean().optional(),
  })
  .refine(
    (value) => value.app !== undefined || value.email !== undefined || value.browser !== undefined,
    { message: 'au moins un canal est attendu' },
  );

const TypePatch = z
  .object({
    revision: z.boolean().optional(),
    validation: z.boolean().optional(),
    course: z.boolean().optional(),
    gap: z.boolean().optional(),
    planning: z.boolean().optional(),
    relaunch: z.boolean().optional(),
  })
  .refine((value) => Object.values(value).some((enabled) => enabled !== undefined), {
    message: 'au moins un type est attendu',
  });

/**
 * ET-3, CL-1 — partial patch of the settings. `channels.app` only accepts `true`: a client can
 * never turn off the always-on in-app channel. At least one field is required, so an empty body
 * is a 400 without any write.
 */
export const NotificationSettingsPatch = z
  .object({
    channels: ChannelPatch.optional(),
    types: TypePatch.optional(),
    digestTime: QuietTime.optional(),
    quietStart: QuietTime.optional(),
    quietEnd: QuietTime.optional(),
    weekendQuiet: z.boolean().optional(),
    maxPerDay: NotificationMaxPerDay.optional(),
    /** `updatedAt` read by the caller; a stale value answers 409 (CL-2). */
    expectedUpdatedAt: IsoDateTime.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'au moins un réglage est attendu',
  });
export type NotificationSettingsPatch = z.infer<typeof NotificationSettingsPatch>;

/** ET-3 — the settings of the authenticated learner. */
export const meNotificationSettingsGet = defineRoute({
  id: 'me.notificationSettings.get',
  method: 'GET',
  path: '/api/v1/me/notification-settings',
  auth: 'user',
  output: NotificationSettingsDto,
  successStatus: 200,
  summary:
    'Réglages de notifications du seul utilisateur connecté, normalisés pour l’onglet Notifications (SPEC-708).',
  errors: ['UNAUTHENTICATED', 'NOT_FOUND'],
});

/** ET-3, ET-1 — partial, idempotent PATCH returning the normalised settings. */
export const meNotificationSettingsUpdate = defineRoute({
  id: 'me.notificationSettings.update',
  method: 'PATCH',
  path: '/api/v1/me/notification-settings',
  auth: 'user',
  body: NotificationSettingsPatch,
  output: NotificationSettingsDto,
  successStatus: 200,
  idempotent: true,
  summary:
    'Enregistre un patch partiel des réglages de notifications et retourne les réglages normalisés (SPEC-708).',
  errors: ['VALIDATION_FAILED', 'CONFLICT', 'NOT_FOUND', 'UNAUTHENTICATED'],
});

export const parametresNotificationsRoutes = {
  meNotificationSettingsGet,
  meNotificationSettingsUpdate,
} as const;
