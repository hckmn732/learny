// Effective sending and re-evaluation of one delivery (SPEC-209 EF-5, EF-7, ET-4, ET-7).
//
// The network call happens outside any transaction; the journal line is then updated in a single
// statement. A sent line is never reopened, so replaying `notification/delivery-due` or running the
// deferred job twice sends nothing twice (CA-4). The push channel keeps its own journal rules
// (SPEC-205, ADR-0244/0266); this module only calls `sendPush`.
import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';

import { AppError, err, ok, type Clock, type LearnyLogger, type Result } from '@learny/core';
import {
  schema,
  updateDeliveryStatus,
  type Db,
  type DbTx,
  type Notification,
  type NotificationDelivery,
} from '@learny/db';

import { isRejectedEmailError, isTransientEmailError, sendEmail } from './email/index';
import { createPushTransport, sendPush, type PushDeps, type PushSendOutcome } from './push/index';
import { buildEmailContent } from './templates/email-props';
import { NOTIFICATION_TEMPLATES } from './templates/index';

const { notificationDeliveries, notifications, profiles } = schema;

export interface DeliveryContext {
  requestId: string;
  sdb: Db;
  clock: Clock;
  logger: LearnyLogger;
}

export interface DeliveryDeps {
  /** Push transport wiring; defaults to the configured mode (mock outside production). */
  push?: PushDeps;
}

export interface DeliveryOutcome {
  deliveryId: string;
  channel: 'email' | 'push';
  status: 'sent' | 'failed' | 'skipped_pref' | 'scheduled' | 'deferred_quiet' | 'capped';
  error: string | null;
  /** The transport error is worth another attempt (Inngest retry, SPEC-205 round). */
  retryable: boolean;
  /** Nothing was attempted: already sent, or not due yet. */
  skipped: boolean;
}

function pushDepsOf(ctx: DeliveryContext): PushDeps {
  if (process.env.PUSH_MODE !== 'live') {
    return {
      transport: createPushTransport({ mode: 'mock', now: () => ctx.clock.now() }),
    };
  }
  return {
    transport: createPushTransport({
      mode: 'live',
      ci: process.env.CI,
      vapid: {
        subject: process.env.VAPID_SUBJECT,
        publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
        privateKey: process.env.VAPID_PRIVATE_KEY,
      },
      now: () => ctx.clock.now(),
    }),
  };
}

interface Loaded {
  delivery: NotificationDelivery;
  notification: Notification;
  firstName: string | null;
  tutorTone: string;
}

async function loadDelivery(ctx: DeliveryContext, deliveryId: string): Promise<Loaded | null> {
  const rows = await ctx.sdb
    .select({
      delivery: notificationDeliveries,
      notification: notifications,
      firstName: profiles.firstName,
      tutorTone: profiles.tutorTone,
    })
    .from(notificationDeliveries)
    .innerJoin(notifications, eq(notifications.id, notificationDeliveries.notificationId))
    .innerJoin(profiles, eq(profiles.id, notifications.userId))
    .where(eq(notificationDeliveries.id, deliveryId))
    .limit(1);
  return rows[0] ?? null;
}

/** EF-5 — updates one journal line in its own short transaction. */
function updateDelivery(
  ctx: DeliveryContext,
  input: Parameters<typeof updateDeliveryStatus>[1],
): Promise<NotificationDelivery> {
  return ctx.sdb.transaction((tx) => updateDeliveryStatus(tx, input));
}

/** EF-5 — deliveries whose re-evaluation instant is reached, oldest first. */
export async function listDueDeliveries(
  ctx: Pick<DeliveryContext, 'sdb'>,
  now: Date,
  limit = 100,
): Promise<NotificationDelivery[]> {
  return ctx.sdb
    .select()
    .from(notificationDeliveries)
    .where(
      and(
        inArray(notificationDeliveries.status, ['scheduled', 'deferred_quiet']),
        lte(notificationDeliveries.scheduledFor, now),
      ),
    )
    .orderBy(asc(notificationDeliveries.scheduledFor))
    .limit(limit);
}

/** BR-NOT-06, CL-5 — a read notification or a passed deadline abandons the deferred send. */
async function abandonIfStale(
  ctx: DeliveryContext,
  loaded: Loaded,
  staleAt: Date | null,
  now: Date,
): Promise<DeliveryOutcome | null> {
  const stale =
    loaded.notification.readAt !== null || (staleAt !== null && staleAt.getTime() <= now.getTime());
  if (!stale) return null;
  const delivery = await updateDelivery(ctx, {
    deliveryId: loaded.delivery.id,
    status: 'skipped_pref',
    scheduledFor: null,
    sentAt: null,
    error: 'stale',
  });
  return {
    deliveryId: delivery.id,
    channel: delivery.channel,
    status: 'skipped_pref',
    error: 'stale',
    retryable: false,
    skipped: true,
  };
}

/**
 * EF-5, EF-7, ET-4 — sends one pending delivery, if it is due and still meaningful. Idempotent on
 * the delivery identifier; a final `sent` line is returned untouched.
 */
export async function deliverDelivery(
  ctx: DeliveryContext,
  deliveryId: string,
  deps: DeliveryDeps = {},
  options: { staleAt?: Date | null; data?: Record<string, unknown> } = {},
): Promise<Result<DeliveryOutcome>> {
  const loaded = await loadDelivery(ctx, deliveryId);
  if (loaded === null) return err(new AppError('NOT_FOUND', 'Livraison introuvable.'));
  const now = ctx.clock.now();
  if (loaded.delivery.status === 'sent') {
    return ok({
      deliveryId,
      channel: loaded.delivery.channel,
      status: 'sent',
      error: null,
      retryable: false,
      skipped: true,
    });
  }
  if (
    (loaded.delivery.status === 'scheduled' || loaded.delivery.status === 'deferred_quiet') &&
    loaded.delivery.scheduledFor !== null &&
    loaded.delivery.scheduledFor.getTime() > now.getTime()
  ) {
    return ok({
      deliveryId,
      channel: loaded.delivery.channel,
      status: loaded.delivery.status,
      error: loaded.delivery.error,
      retryable: false,
      skipped: true,
    });
  }
  if (
    loaded.delivery.status === 'capped' ||
    loaded.delivery.status === 'skipped_pref' ||
    loaded.delivery.status === 'deferred_quiet'
  ) {
    if (loaded.delivery.status === 'deferred_quiet') {
      const abandoned = await abandonIfStale(ctx, loaded, options.staleAt ?? null, now);
      if (abandoned !== null) return ok(abandoned);
    }
    // Deferred, capped and skipped are waiting for the deferred job or are final.
    if (loaded.delivery.status !== 'deferred_quiet') {
      return ok({
        deliveryId,
        channel: loaded.delivery.channel,
        status: loaded.delivery.status,
        error: loaded.delivery.error,
        retryable: false,
        skipped: true,
      });
    }
  } else {
    const abandoned = await abandonIfStale(ctx, loaded, options.staleAt ?? null, now);
    if (abandoned !== null) return ok(abandoned);
  }

  if (loaded.delivery.channel === 'email') {
    return deliverEmail(ctx, loaded, options.data ?? {});
  }
  return deliverPush(ctx, loaded, deps);
}

async function deliverPush(
  ctx: DeliveryContext,
  loaded: Loaded,
  deps: DeliveryDeps,
): Promise<Result<DeliveryOutcome>> {
  const outcome: PushSendOutcome = await sendPush(
    { requestId: ctx.requestId, sdb: ctx.sdb, clock: ctx.clock, logger: ctx.logger },
    {
      userId: loaded.notification.userId,
      notification: {
        id: loaded.notification.id,
        title: loaded.notification.title,
        body: loaded.notification.body,
        icon: loaded.notification.icon,
        href: loaded.notification.href,
      },
    },
    deps.push ?? pushDepsOf(ctx),
  );
  return ok({
    deliveryId: loaded.delivery.id,
    channel: 'push',
    status: outcome.status === 'skipped' ? 'skipped_pref' : outcome.status,
    error: outcome.error,
    retryable: outcome.retryable,
    skipped: outcome.status === 'skipped',
  });
}

async function deliverEmail(
  ctx: DeliveryContext,
  loaded: Loaded,
  data: Record<string, unknown>,
): Promise<Result<DeliveryOutcome>> {
  const template = NOTIFICATION_TEMPLATES[loaded.notification.type];
  const content = buildEmailContent(
    loaded.notification.type,
    template,
    data,
    {
      title: loaded.notification.title,
      body: loaded.notification.body,
      href: loaded.notification.href,
    },
    loaded.firstName,
  );
  if (content === null) {
    await updateDelivery(ctx, {
      deliveryId: loaded.delivery.id,
      status: 'skipped_pref',
      scheduledFor: null,
      sentAt: null,
      error: 'no_template',
    });
    return ok({
      deliveryId: loaded.delivery.id,
      channel: 'email',
      status: 'skipped_pref',
      error: 'no_template',
      retryable: false,
      skipped: true,
    });
  }

  try {
    const sent = await sendEmail(ctx, {
      userId: loaded.notification.userId,
      template: content.template,
      props: content.props,
      idempotencyKey: `notification:${loaded.delivery.id}`,
    });
    if (!sent.ok) throw sent.error;
    await updateDelivery(ctx, {
      deliveryId: loaded.delivery.id,
      status: 'sent',
      scheduledFor: null,
      sentAt: ctx.clock.now(),
      error: null,
    });
    return ok({
      deliveryId: loaded.delivery.id,
      channel: 'email',
      status: 'sent',
      error: null,
      retryable: false,
      skipped: false,
    });
  } catch (error) {
    const transient = isTransientEmailError(error) || !isRejectedEmailError(error);
    const code = transient ? 'transient' : 'rejected';
    await updateDelivery(ctx, {
      deliveryId: loaded.delivery.id,
      status: 'failed',
      scheduledFor: null,
      sentAt: null,
      error: code,
    });
    ctx.logger.warn('notification email failed', {
      outcome: code,
    });
    return err(
      error instanceof AppError
        ? error
        : new AppError(
            transient ? 'SERVICE_UNAVAILABLE' : 'VALIDATION_FAILED',
            transient
              ? 'L’e-mail n’a pas pu être envoyé, nouvel essai possible.'
              : 'L’adresse e-mail est refusée.',
          ),
    );
  }
}

/** EF-7 — counts the distinct notifications sent during the local day, digest excluded. */
export async function countSentNotifications(
  tx: DbTx,
  input: { userId: string; dayStart: Date; dayEnd: Date; now: Date },
): Promise<number> {
  const rows = await tx.execute<{ count: number }>(sql`
    select count(distinct d.notification_id)::int as count
    from public.notification_deliveries d
    join public.notifications n on n.id = d.notification_id
    where n.user_id = ${input.userId}::uuid
      and n.type <> 'daily_digest'
      and (
        d.status = 'sent'
        or (d.status = 'scheduled' and d.scheduled_for <= ${input.now.toISOString()}::timestamptz)
      )
      and (
        (d.sent_at >= ${input.dayStart.toISOString()}::timestamptz
          and d.sent_at < ${input.dayEnd.toISOString()}::timestamptz)
        or (d.scheduled_for >= ${input.dayStart.toISOString()}::timestamptz
          and d.scheduled_for < ${input.dayEnd.toISOString()}::timestamptz)
      )
  `);
  return rows[0]?.count ?? 0;
}
