// Repositories of the notification inbox and of the delivery journal (SPEC-109 EF-2 to EF-5,
// ET-3 to ET-5).
//
// Creation is idempotent through `unique(user_id, dedupe_key)`: `insert … on conflict do nothing`
// followed by a re-read returns the existing row untouched, so `read_at` is never reset (CL-3).
// A conflict never writes a delivery twice either: a notification has at most one delivery per
// channel, and `createDelivery` returns the existing row on conflict (CL-1). Reads are always
// scoped by `user_id`, which keeps another learner's identifier answering `null` or zero rows even
// when the caller uses the service role (CL-7).
import { and, desc, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '@learny/core';

import type { DbTx } from '../client';
import {
  DELIVERY_CHANNELS,
  NOTIFICATION_FILTERS,
  NOTIFICATION_TYPES,
  deliveryStateSchema,
  notificationBodySchema,
  notificationDedupeKeySchema,
  notificationDeliveries,
  notificationHrefSchema,
  notificationIconSchema,
  notificationTitleSchema,
  notifications,
  type DeliveryChannel,
  type DeliveryStatus,
  type Notification,
  type NotificationDelivery,
  type NotificationFilter,
  type NotificationType,
} from '../schema/notifications';

const uuidSchema = z.uuid();
const instantSchema = z.date().refine((value) => !Number.isNaN(value.getTime()), {
  message: 'instant invalide',
});
const limitSchema = z.int().min(1).max(100);
const offsetSchema = z.int().min(0);
const filterSchema = z.enum(NOTIFICATION_FILTERS);
const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
const channelSchema = z.enum(DELIVERY_CHANNELS);

function validationError(field: string, issues: string[]): AppError {
  return new AppError('VALIDATION_FAILED', `Champ « ${field} » invalide : ${issues.join(' ; ')}`, {
    errors: issues.map((message) => ({ path: field, message })),
  });
}

function parse<T>(schema: z.ZodType<T>, value: unknown, field: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw validationError(
      field,
      result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(racine)';
        return `${path} : ${issue.message}`;
      }),
    );
  }
  return result.data;
}

function identifier(value: string, field: string): string {
  return parse(uuidSchema, value, field);
}

export interface CreateNotificationInput {
  userId: string;
  formationId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  /** Internal relative path, validated as such (ET-2, CL-4). */
  href: string;
  icon: string;
  dedupeKey?: string | null;
  /** Injected clock instant; Postgres `now()` is used when omitted (ADR-0047). */
  createdAt?: Date;
}

export interface CreatedNotification {
  notification: Notification;
  /** False when `(user_id, dedupe_key)` already existed; the existing row is returned as is. */
  created: boolean;
}

/**
 * EF-2, ET-3, CL-1 to CL-3 — creates one in-app notification, idempotent on the dedupe key. A null
 * key is distinct every time (Postgres `NULLS DISTINCT`), which allows two genuinely different
 * events without a key.
 */
export async function createNotification(
  tx: DbTx,
  input: CreateNotificationInput,
): Promise<CreatedNotification> {
  const userId = identifier(input.userId, 'userId');
  const formationId =
    input.formationId === undefined || input.formationId === null
      ? null
      : identifier(input.formationId, 'formationId');
  const type = parse(notificationTypeSchema, input.type, 'type');
  const title = parse(notificationTitleSchema, input.title, 'title');
  const body = parse(notificationBodySchema, input.body, 'body');
  const href = parse(notificationHrefSchema, input.href, 'href');
  const icon = parse(notificationIconSchema, input.icon, 'icon');
  const dedupeKey =
    input.dedupeKey === undefined || input.dedupeKey === null
      ? null
      : parse(notificationDedupeKeySchema, input.dedupeKey, 'dedupeKey');
  const createdAt =
    input.createdAt === undefined ? undefined : parse(instantSchema, input.createdAt, 'createdAt');

  // A null dedupe key never conflicts; naming the constraint is harmless and keeps one code path.
  const inserted = await tx
    .insert(notifications)
    .values({
      userId,
      formationId,
      type,
      title,
      body,
      href,
      icon,
      dedupeKey,
      ...(createdAt === undefined ? {} : { createdAt }),
    })
    .onConflictDoNothing({
      target: [notifications.userId, notifications.dedupeKey],
    })
    .returning();
  const created = inserted[0];
  if (created !== undefined) return { notification: created, created: true };

  if (dedupeKey === null) {
    // A null key cannot conflict; reaching this branch means the insert silently failed.
    throw new AppError('INTERNAL_ERROR', 'Notification introuvable après insertion.');
  }

  const existing = await tx
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.dedupeKey, dedupeKey)));
  const notification = existing[0];
  if (notification === undefined) {
    throw new AppError('INTERNAL_ERROR', 'Notification introuvable après conflit.');
  }
  return { notification, created: false };
}

export interface NotificationRef {
  userId: string;
  notificationId: string;
}

/** EF-4, CL-7 — reads one notification of the owner; another learner's id yields `null`. */
export async function getNotification(
  tx: DbTx,
  input: NotificationRef,
): Promise<Notification | null> {
  const userId = identifier(input.userId, 'userId');
  const notificationId = identifier(input.notificationId, 'notificationId');
  const rows = await tx
    .select()
    .from(notifications)
    .where(and(eq(notifications.id, notificationId), eq(notifications.userId, userId)));
  return rows[0] ?? null;
}

export interface NotificationPageInput {
  userId: string;
  filter?: NotificationFilter;
  limit?: number;
  offset?: number;
}

/**
 * EF-4, EF-5 — the paginated inbox of one learner, newest first, with the `all|unread` filter. The
 * order uses `(created_at desc, id desc)` so two notifications created in the same instant keep a
 * stable page.
 */
export async function listNotifications(
  tx: DbTx,
  input: NotificationPageInput,
): Promise<Notification[]> {
  const userId = identifier(input.userId, 'userId');
  const filter = parse(filterSchema, input.filter ?? 'all', 'filter');
  const limit = parse(limitSchema, input.limit ?? 20, 'limit');
  const offset = parse(offsetSchema, input.offset ?? 0, 'offset');
  const scope =
    filter === 'unread'
      ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
      : eq(notifications.userId, userId);
  return tx
    .select()
    .from(notifications)
    .where(scope)
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit)
    .offset(offset);
}

/** EF-4, EF-5 — the unread badge, computed on `read_at is null`. */
export async function countUnreadNotifications(
  tx: DbTx,
  input: Pick<NotificationRef, 'userId'>,
): Promise<number> {
  const userId = identifier(input.userId, 'userId');
  const rows = await tx
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return rows.length;
}

export interface MarkReadInput {
  userId: string;
  notificationId: string;
  /** Injected clock instant (ADR-0047). */
  readAt: Date;
}

/**
 * EF-4, CL-7 — marks one notification read. The update only targets the owner's unread row, so a
 * foreign or already-read identifier affects zero rows and leaks nothing about its existence.
 */
export async function markNotificationRead(tx: DbTx, input: MarkReadInput): Promise<number> {
  const userId = identifier(input.userId, 'userId');
  const notificationId = identifier(input.notificationId, 'notificationId');
  const readAt = parse(instantSchema, input.readAt, 'readAt');
  const updated = await tx
    .update(notifications)
    .set({ readAt })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    )
    .returning({ id: notifications.id });
  return updated.length;
}

/** EF-4, CL-7 — marks every unread notification of the owner read; returns the affected count. */
export async function markAllNotificationsRead(
  tx: DbTx,
  input: Pick<NotificationRef, 'userId'> & { readAt: Date },
): Promise<number> {
  const userId = identifier(input.userId, 'userId');
  const readAt = parse(instantSchema, input.readAt, 'readAt');
  const updated = await tx
    .update(notifications)
    .set({ readAt })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .returning({ id: notifications.id });
  return updated.length;
}

export interface CreateDeliveryInput {
  notificationId: string;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  scheduledFor?: Date | null;
  sentAt?: Date | null;
  error?: string | null;
}

export interface CreatedDelivery {
  delivery: NotificationDelivery;
  created: boolean;
}

interface DeliveryState {
  status: DeliveryStatus;
  scheduledFor: Date | null;
  sentAt: Date | null;
  error: string | null;
}

function validateDeliveryState(input: {
  status: DeliveryStatus;
  scheduledFor?: Date | null;
  sentAt?: Date | null;
  error?: string | null;
}): DeliveryState {
  const parsed = parse(deliveryStateSchema, input, 'delivery');
  return {
    status: parsed.status,
    scheduledFor: parsed.scheduledFor ?? null,
    sentAt: parsed.sentAt ?? null,
    error: parsed.error ?? null,
  };
}

/**
 * EF-3, ET-5, CL-1 — records the decision taken for one channel. A second call for the same
 * notification and channel returns the existing line; replaying an event never duplicates the
 * journal, even when two workers race.
 */
export async function createDelivery(
  tx: DbTx,
  input: CreateDeliveryInput,
): Promise<CreatedDelivery> {
  const notificationId = identifier(input.notificationId, 'notificationId');
  const channel = parse(channelSchema, input.channel, 'channel');
  const { status, scheduledFor, sentAt, error } = validateDeliveryState(input);

  const inserted = await tx
    .insert(notificationDeliveries)
    .values({ notificationId, channel, status, scheduledFor, sentAt, error })
    .onConflictDoNothing({
      target: [notificationDeliveries.notificationId, notificationDeliveries.channel],
    })
    .returning();
  const created = inserted[0];
  if (created !== undefined) return { delivery: created, created: true };

  const existing = await tx
    .select()
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.notificationId, notificationId),
        eq(notificationDeliveries.channel, channel),
      ),
    );
  const delivery = existing[0];
  if (delivery === undefined) {
    throw new AppError('INTERNAL_ERROR', 'Livraison introuvable après conflit.');
  }
  return { delivery, created: false };
}

export interface DeliveryRef {
  notificationId: string;
  channel: DeliveryChannel;
}

/** EF-5 — reads one delivery of a notification for diagnosis. */
export async function getDelivery(
  tx: DbTx,
  input: DeliveryRef,
): Promise<NotificationDelivery | null> {
  const notificationId = identifier(input.notificationId, 'notificationId');
  const channel = parse(channelSchema, input.channel, 'channel');
  const rows = await tx
    .select()
    .from(notificationDeliveries)
    .where(
      and(
        eq(notificationDeliveries.notificationId, notificationId),
        eq(notificationDeliveries.channel, channel),
      ),
    );
  return rows[0] ?? null;
}

export interface UserNotificationRef extends NotificationRef {
  channel?: DeliveryChannel;
}

/**
 * EF-5, CL-7 — the delivery journal of one notification, restricted to its owner. The join on
 * `notifications` is the ownership check: a foreign notification id returns no line at all.
 */
export async function listNotificationDeliveries(
  tx: DbTx,
  input: UserNotificationRef,
): Promise<NotificationDelivery[]> {
  const userId = identifier(input.userId, 'userId');
  const notificationId = identifier(input.notificationId, 'notificationId');
  const channel =
    input.channel === undefined ? undefined : parse(channelSchema, input.channel, 'channel');
  return tx
    .select({ delivery: notificationDeliveries })
    .from(notificationDeliveries)
    .innerJoin(notifications, eq(notifications.id, notificationDeliveries.notificationId))
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
        ...(channel === undefined ? [] : [eq(notificationDeliveries.channel, channel)]),
      ),
    )
    .orderBy(notificationDeliveries.channel)
    .then((rows) => rows.map((row) => row.delivery));
}

export interface UpdateDeliveryInput {
  deliveryId: string;
  status: DeliveryStatus;
  scheduledFor?: Date | null;
  sentAt?: Date | null;
  error?: string | null;
}

/**
 * EF-3, ET-5 — moves one delivery to its next status. The database trigger refuses to reopen a
 * `sent` line or to rewrite its `sent_at`; the repository surfaces the raw constraint error so the
 * caller decides whether to retry.
 */
export async function updateDeliveryStatus(
  tx: DbTx,
  input: UpdateDeliveryInput,
): Promise<NotificationDelivery> {
  const deliveryId = identifier(input.deliveryId, 'deliveryId');
  const { status, scheduledFor, sentAt, error } = validateDeliveryState(input);
  const updated = await tx
    .update(notificationDeliveries)
    .set({ status, scheduledFor, sentAt, error })
    .where(eq(notificationDeliveries.id, deliveryId))
    .returning();
  const delivery = updated[0];
  if (delivery === undefined) {
    throw new AppError('NOT_FOUND', 'Livraison introuvable.');
  }
  return delivery;
}
