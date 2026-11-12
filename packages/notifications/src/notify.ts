// Unified notification service (SPEC-209 EF-1 to EF-7, ET-1 to ET-5, ADR-0214, ADR-0265).
//
// `notify` is the only entry point of the notification producers. It always creates the in-app row
// (BR-NOT-03), then records one decision per external channel inside the same transaction, and
// finally sends the deliveries that are due after the commit. Deduplication is the database unique
// key `(user_id, dedupe_key)`: a second call creates neither a row nor a delivery (EF-1, CL-4).
//
// The daily cap is counted and decided under the transaction-scoped advisory lock of the learner,
// so ten concurrent calls cannot exceed `max_per_day` (ET-5, CL-3). The distinct notification is
// the counting unit: e-mail and push of the same notification count once (EF-7, ADR-0214).
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

import { NotifyInput } from '@learny/contracts';
import {
  AppError,
  err,
  ok,
  userDayBounds,
  userLocalDay,
  type Clock,
  type LearnyLogger,
  type Result,
} from '@learny/core';
import {
  createDelivery,
  createNotification,
  listNotificationDeliveries,
  notificationSettings,
  schema,
  type Db,
  type Notification,
  type NotificationDelivery,
} from '@learny/db';

import type { Tone } from '../emails/tone';

import { countSentNotifications, deliverDelivery, type DeliveryDeps } from './deliveries';
import { decideDelivery, type DeliverySettings } from './routing';
import { NOTIFICATION_TEMPLATES, channelsOf } from './templates/index';

const { profiles } = schema;

// Structural context: the services `SystemContext`, the jobs `JobContext` and the tests share it.
export interface NotifySystemContext {
  requestId: string;
  sdb: Db;
  clock: Clock;
  logger: LearnyLogger;
}

export interface NotifyResultValue {
  notificationId: string;
  created: boolean;
  deliveries: {
    channel: 'email' | 'push';
    status: NotificationDelivery['status'];
    scheduledFor: string | null;
  }[];
}

const DEFAULT_SETTINGS: DeliverySettings = {
  channelEmail: true,
  channelPush: true,
  typeRevision: true,
  typeValidation: true,
  typeCourse: true,
  typeGap: true,
  typePlanning: true,
  typeRelaunch: true,
  quietStart: '21:00',
  quietEnd: '08:00',
  weekendQuiet: true,
  maxPerDay: 5,
};

function toSettings(row: typeof notificationSettings.$inferSelect | undefined): DeliverySettings {
  if (row === undefined) return DEFAULT_SETTINGS;
  return {
    channelEmail: row.channelEmail,
    channelPush: row.channelPush,
    typeRevision: row.typeRevision,
    typeValidation: row.typeValidation,
    typeCourse: row.typeCourse,
    typeGap: row.typeGap,
    typePlanning: row.typePlanning,
    typeRelaunch: row.typeRelaunch,
    quietStart: row.quietStart.slice(0, 5),
    quietEnd: row.quietEnd.slice(0, 5),
    weekendQuiet: row.weekendQuiet,
    maxPerDay: row.maxPerDay === 3 || row.maxPerDay === 8 ? row.maxPerDay : 5,
  };
}

function instant(value: Date): string {
  return value.toISOString();
}

function validationError(error: z.ZodError): AppError {
  return new AppError('VALIDATION_FAILED', 'Notification invalide.', {
    errors: error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  });
}

/**
 * EF-1 — creates the in-app notification and the delivery decisions, then sends what is due.
 * A missing profile is a `NOT_FOUND`; a malformed input a `VALIDATION_FAILED`.
 */
export async function notify(
  sctx: NotifySystemContext,
  input: unknown,
  deps: DeliveryDeps = {},
): Promise<Result<NotifyResultValue>> {
  const parsed = NotifyInput.safeParse(input);
  if (!parsed.success) return err(validationError(parsed.error));
  const value = parsed.data;

  const [profile] = await sctx.sdb
    .select({ timezone: profiles.timezone, tutorTone: profiles.tutorTone })
    .from(profiles)
    .where(eq(profiles.id, value.userId))
    .limit(1);
  if (profile === undefined) return err(new AppError('NOT_FOUND', 'Profil introuvable.'));

  const [settingsRow] = await sctx.sdb
    .select()
    .from(notificationSettings)
    .where(eq(notificationSettings.userId, value.userId))
    .limit(1);
  const settings = toSettings(settingsRow);
  const timeZone = profile.timezone;
  const tone: Tone = profile.tutorTone === 'tu' ? 'tu' : 'vous';
  const template = NOTIFICATION_TEMPLATES[value.type];
  const title = template.title(value.data, tone);
  const body = template.body(value.data, tone);
  const href = template.href(value.data);
  const now = sctx.clock.now();
  const today = userLocalDay(now, timeZone);
  const bounds = userDayBounds(today, timeZone);
  const eligibleAt = value.eligibleAt === undefined ? null : new Date(value.eligibleAt);
  const staleAt = value.staleAt === undefined ? null : new Date(value.staleAt);

  const transaction = await sctx.sdb.transaction(async (tx) => {
    // ET-5 — serialise the cap count of one learner, never of the whole table.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${value.userId})::bigint)`);

    const inserted = await createNotification(tx, {
      userId: value.userId,
      formationId: value.formationId ?? null,
      type: value.type,
      title,
      body,
      href,
      icon: template.icon,
      dedupeKey: value.dedupeKey ?? null,
      createdAt: now,
    });
    if (!inserted.created) {
      return {
        created: false,
        notification: inserted.notification,
        deliveries: await listNotificationDeliveries(tx, {
          userId: value.userId,
          notificationId: inserted.notification.id,
        }),
        immediate: [] as { deliveryId: string; notification: Notification }[],
      };
    }

    const sentToday = await countSentNotifications(tx, {
      userId: value.userId,
      dayStart: bounds.start,
      dayEnd: bounds.end,
      now,
    });
    const decided: NotificationDelivery[] = [];
    const due: { deliveryId: string; notification: Notification }[] = [];
    for (const channel of channelsOf(value.type)) {
      const decision = decideDelivery({
        channel,
        type: value.type,
        settings,
        now,
        timeZone,
        sentToday,
        eligibleAt,
        staleAt,
      });
      // The decision `sent` is recorded as scheduled at the current instant until the send is done:
      // a rollback keeps the journal coherent and a crash leaves a replayable line (ET-4).
      const status = decision.status === 'sent' ? 'scheduled' : decision.status;
      const scheduledFor = decision.status === 'sent' ? now : (decision.scheduledFor ?? null);
      const row = await createDelivery(tx, {
        notificationId: inserted.notification.id,
        channel,
        status,
        scheduledFor: status === 'scheduled' || status === 'deferred_quiet' ? scheduledFor : null,
        error: decision.error ?? null,
      });
      decided.push(row.delivery);
      if (decision.status === 'sent') {
        await tx.execute(sql`
          select public.enqueue_event(
            ${`notification-delivery:${row.delivery.id}`},
            ${'notification/delivery-due'},
            ${JSON.stringify({
              userId: value.userId,
              notificationId: inserted.notification.id,
              deliveryId: row.delivery.id,
              channel,
              data: value.data,
            })}::jsonb,
            ${value.userId}::uuid
          )
        `);
        due.push({ deliveryId: row.delivery.id, notification: inserted.notification });
      }
    }
    return {
      created: true,
      notification: inserted.notification,
      deliveries: decided,
      immediate: due,
    };
  });

  const { created, notification, deliveries, immediate } = transaction;

  if (!created) {
    return ok({
      notificationId: notification.id,
      created: false,
      deliveries: deliveries.map((row) => ({
        channel: row.channel,
        status: row.status,
        scheduledFor: row.scheduledFor === null ? null : instant(row.scheduledFor),
      })),
    });
  }

  // Sending happens after the commit. The outbox event above remains the durable retry path.
  for (const item of immediate) {
    await deliverDelivery(sctx, item.deliveryId, deps, { staleAt, data: value.data });
  }

  const finalRows = await sctx.sdb.transaction((tx) =>
    listNotificationDeliveries(tx, {
      userId: value.userId,
      notificationId: notification.id,
    }),
  );
  return ok({
    notificationId: notification.id,
    created: true,
    deliveries: finalRows.map((row) => ({
      channel: row.channel,
      status: row.status,
      scheduledFor: row.scheduledFor === null ? null : instant(row.scheduledFor),
    })),
  });
}
