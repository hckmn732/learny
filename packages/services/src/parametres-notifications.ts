// Notifications tab of the settings screen (SPEC-708 EF-1 to EF-4, ET-1 to ET-5; BR-SET-03,
// BR-NOT-04).
//
// The stored row stays `notification_settings` (SPEC-102, SPEC-209): this service only normalises it
// for the screen and writes a partial patch in ONE transaction under the learner's RLS client. The
// in-app channel is always on; the browser channel is only saved after a granted permission by the
// caller (EF-1). The decision of a test notification reuses the pure router of SPEC-209, so the
// saved settings take effect on the real notification service without a second implementation.
import { eq } from 'drizzle-orm';

import { NOTIFICATION_DEFAULTS } from '@learny/config/product';
import {
  NotificationSettingsDto as NotificationSettingsDtoSchema,
  NotificationSettingsPatch as NotificationSettingsPatchSchema,
  type NotificationSettingsDto,
  type NotificationSettingsPatch,
  type NotificationTypes,
  type QuietHoursState,
} from '@learny/contracts';
import { AppError, localTimeToInstant, userLocalDay, type Result } from '@learny/core';
import { schema, type DbTx } from '@learny/db';
import { decideDelivery, type DeliverySettings } from '@learny/notifications/routing';

import type { ServiceContext } from './context';
import { requireUser, toResult } from './resources/result';

const { notificationSettings, profiles } = schema;

type SettingsRow = typeof notificationSettings.$inferSelect;

/** ET-3, CL-1 — the first validation issue of the body, as the API reports it. */
export function parseNotificationSettingsPatch(input: unknown): NotificationSettingsPatch {
  const parsed = NotificationSettingsPatchSchema.safeParse(input);
  if (!parsed.success) {
    throw new AppError('VALIDATION_FAILED', 'Les réglages envoyés sont invalides.', {
      status: 400,
      errors: parsed.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    });
  }
  return parsed.data;
}

/** CA-1 — « N sur 6 activés »: the counter of the six type switches. */
export function activeNotificationTypeCount(types: NotificationTypes): number {
  return Object.values(types).filter((enabled) => enabled).length;
}

/**
 * ET-4, CL-5 — the quiet window as displayed. A range that starts after its end crosses midnight
 * (21:00–08:00); `start = end` is the empty range of SPEC-207 (no quiet hours).
 */
export function quietHoursOf(start: string, end: string): QuietHoursState {
  const from = start.slice(0, 5);
  const to = end.slice(0, 5);
  return {
    start: from,
    end: to,
    crossesMidnight: from > to,
    empty: from === to,
  };
}

/** EF-2 — the six switches, mapped to the columns of SPEC-102 in mockup order. */
function typesOf(row: SettingsRow): NotificationTypes {
  return {
    revision: row.typeRevision,
    validation: row.typeValidation,
    course: row.typeCourse,
    gap: row.typeGap,
    planning: row.typePlanning,
    relaunch: row.typeRelaunch,
  };
}

/** ET-3 — normalised DTO, validated by the shared contract before leaving the service. */
export function notificationSettingsToDto(row: SettingsRow): NotificationSettingsDto {
  const types = typesOf(row);
  const parsed = NotificationSettingsDtoSchema.safeParse({
    channels: { app: true, email: row.channelEmail, browser: row.channelPush },
    types,
    digestTime: row.digestTime.slice(0, 5),
    quiet: quietHoursOf(row.quietStart, row.quietEnd),
    weekendQuiet: row.weekendQuiet,
    maxPerDay: row.maxPerDay,
    activeTypeCount: activeNotificationTypeCount(types),
    updatedAt: row.updatedAt.toISOString(),
  });
  if (!parsed.success) {
    throw new AppError('INTERNAL_ERROR', 'Réglages de notifications incohérents.');
  }
  return parsed.data;
}

async function requireProfile(tx: DbTx, userId: string): Promise<void> {
  const [row] = await tx
    .select({ id: profiles.id })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  if (row === undefined) {
    // CL-1 — another owner's identifier never reveals whether a row exists.
    throw new AppError('NOT_FOUND', 'Réglages de notifications introuvables.');
  }
}

async function readRow(tx: DbTx, userId: string): Promise<SettingsRow> {
  const [row] = await tx
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId))
    .limit(1);
  return row ?? (await insertDefaults(tx, userId));
}

/** BR-NOT-04 — the sign-up trigger normally created the row; a missing one gets the defaults. */
async function insertDefaults(tx: DbTx, userId: string): Promise<SettingsRow> {
  await tx.insert(notificationSettings).values({ userId }).onConflictDoNothing();
  const [row] = await tx
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, userId))
    .limit(1);
  if (row === undefined) {
    throw new AppError('NOT_FOUND', 'Réglages de notifications introuvables.');
  }
  return row;
}

/** GET /api/v1/me/notification-settings — the settings of the authenticated learner. */
export function getNotificationSettings(
  ctx: ServiceContext,
): Promise<Result<NotificationSettingsDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run(async (tx) => {
      await requireProfile(tx, userId);
      return notificationSettingsToDto(await readRow(tx, userId));
    });
  });
}

/**
 * PATCH /api/v1/me/notification-settings — partial patch, one transaction, no push subscription
 * touched (ET-3). A stale `expectedUpdatedAt` answers 409 and leaves the row untouched (CL-2).
 */
export function updateNotificationSettings(
  ctx: ServiceContext,
  input: unknown,
): Promise<Result<NotificationSettingsDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const patch = parseNotificationSettingsPatch(input);
    const now = ctx.clock.now();
    return db.run(async (tx) => {
      await requireProfile(tx, userId);
      const [current] = await tx
        .select()
        .from(notificationSettings)
        .where(eq(notificationSettings.userId, userId))
        .for('update')
        .limit(1);
      const row = current ?? (await insertDefaults(tx, userId));
      if (
        patch.expectedUpdatedAt !== undefined &&
        row.updatedAt.toISOString() !== patch.expectedUpdatedAt
      ) {
        throw new AppError(
          'CONFLICT',
          'Vos réglages ont été modifiés ailleurs. Rechargez-les puis réessayez.',
          { status: 409 },
        );
      }
      await tx
        .update(notificationSettings)
        .set({
          ...(patch.channels?.email === undefined ? {} : { channelEmail: patch.channels.email }),
          ...(patch.channels?.browser === undefined ? {} : { channelPush: patch.channels.browser }),
          ...(patch.types?.revision === undefined ? {} : { typeRevision: patch.types.revision }),
          ...(patch.types?.validation === undefined
            ? {}
            : { typeValidation: patch.types.validation }),
          ...(patch.types?.course === undefined ? {} : { typeCourse: patch.types.course }),
          ...(patch.types?.gap === undefined ? {} : { typeGap: patch.types.gap }),
          ...(patch.types?.planning === undefined ? {} : { typePlanning: patch.types.planning }),
          ...(patch.types?.relaunch === undefined ? {} : { typeRelaunch: patch.types.relaunch }),
          ...(patch.digestTime === undefined ? {} : { digestTime: patch.digestTime }),
          ...(patch.quietStart === undefined ? {} : { quietStart: patch.quietStart }),
          ...(patch.quietEnd === undefined ? {} : { quietEnd: patch.quietEnd }),
          ...(patch.weekendQuiet === undefined ? {} : { weekendQuiet: patch.weekendQuiet }),
          ...(patch.maxPerDay === undefined ? {} : { maxPerDay: patch.maxPerDay }),
          updatedAt: now,
        })
        .where(eq(notificationSettings.userId, userId));
      return notificationSettingsToDto(await readRow(tx, userId));
    });
  });
}

/** EF-2 — the stored settings in the shape expected by the router of SPEC-209. */
export function notificationSettingsToDelivery(
  settings: NotificationSettingsDto,
): DeliverySettings {
  return {
    channelEmail: settings.channels.email,
    channelPush: settings.channels.browser,
    typeRevision: settings.types.revision,
    typeValidation: settings.types.validation,
    typeCourse: settings.types.course,
    typeGap: settings.types.gap,
    typePlanning: settings.types.planning,
    typeRelaunch: settings.types.relaunch,
    quietStart: settings.quiet.start,
    quietEnd: settings.quiet.end,
    weekendQuiet: settings.weekendQuiet,
    maxPerDay: settings.maxPerDay,
  };
}

/**
 * CA-3, ET-4 — a test notification decided at `now` by the same pure router as SPEC-209. The
 * caller supplies the learner's IANA zone, so the quiet hours and the weekend rule are applied to
 * the real local clock (including the midnight-crossing range of SPEC-207).
 */
export function decideTestNotification(
  settings: NotificationSettingsDto,
  now: Date,
  timeZone: string,
): {
  status: 'sent' | 'scheduled' | 'deferred_quiet' | 'capped' | 'skipped_pref';
  scheduledFor: string | null;
} {
  const decision = decideDelivery({
    channel: 'email',
    // The relaunch type is one of the six switches and the most typical test case (BR-SET-03).
    type: 'relaunch',
    settings: notificationSettingsToDelivery(settings),
    now,
    timeZone,
    sentToday: 0,
  });
  return {
    status: decision.status,
    scheduledFor: decision.scheduledFor === null ? null : decision.scheduledFor.toISOString(),
  };
}

/**
 * EF-3, ET-4 — next local occurrence of the daily programme. A time already passed today is
 * scheduled for tomorrow, in the profile zone, so a DST change never shifts the wall-clock hour.
 */
export function nextDigestAt(digestTime: string, now: Date, timeZone: string): Date {
  const day = userLocalDay(now, timeZone);
  const today = localTimeToInstant(day, digestTime, timeZone);
  if (today.getTime() > now.getTime()) return today;
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const tomorrow = new Date(Date.UTC(year, month - 1, date));
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return localTimeToInstant(tomorrow.toISOString().slice(0, 10), digestTime, timeZone);
}

/**
 * CA-3 — reads the saved settings and applies them to a test notification at the injected clock in
 * the profile zone. Used by the tests and by the SDD demonstration; it writes nothing.
 */
export function previewTestNotification(ctx: ServiceContext): Promise<
  Result<{
    status: 'sent' | 'scheduled' | 'deferred_quiet' | 'capped' | 'skipped_pref';
    scheduledFor: string | null;
    digestAt: string;
    timezone: string;
  }>
> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run(async (tx) => {
      const [profile] = await tx
        .select({ timezone: profiles.timezone })
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1);
      if (profile === undefined) {
        throw new AppError('NOT_FOUND', 'Profil introuvable.');
      }
      const settings = notificationSettingsToDto(await readRow(tx, userId));
      const now = ctx.clock.now();
      const decision = decideTestNotification(settings, now, profile.timezone);
      return {
        ...decision,
        digestAt: nextDigestAt(settings.digestTime, now, profile.timezone).toISOString(),
        timezone: profile.timezone,
      };
    });
  });
}

/** BR-NOT-04 — defaults of a missing row, exposed for the tests (no duplicated literals there). */
export const NOTIFICATION_SETTINGS_DEFAULTS = NOTIFICATION_DEFAULTS;
