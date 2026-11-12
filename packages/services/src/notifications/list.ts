// Inbox service of the notification panel (SPEC-306 EF-1 to EF-3, ET-1 to ET-3; BR-NOT-01).
//
// Every read and every mutation runs with the learner's own RLS client (`ctx.db`): another
// learner's notifications are neither listed, counted nor updated. The three groups of the mockup
// are resolved here, in the profile's IANA zone, with the injected clock (ADR-0047): comparing UTC
// days naïvely would put a 00:30 Paris notification in the previous day.
import { and, desc, eq, isNull, sql } from 'drizzle-orm';

import {
  NotificationListQuery,
  type NotificationFilter,
  type NotificationItem,
  type NotificationListDto,
  type NotificationReadDto,
  type NotificationUnreadCountDto,
} from '@learny/contracts';
import { AppError, userLocalDay, type Result } from '@learny/core';
import {
  countUnreadNotifications,
  getNotification,
  markAllNotificationsRead,
  markNotificationRead as markNotificationReadRow,
  schema,
  type DbTx,
} from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

const { formations, notifications, profiles } = schema;

/** Civil day before `day`, without going through the process time zone. */
export function previousCivilDay(day: string): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const previous = new Date(Date.UTC(year, month - 1, date - 1));
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${pad(previous.getUTCFullYear(), 4)}-${pad(previous.getUTCMonth() + 1)}-${pad(
    previous.getUTCDate(),
  )}`;
}

/**
 * BR-NOT-01, ET-3 — group of one instant in the learner's zone. The comparison uses civil days,
 * never a fixed number of hours added to the UTC instant.
 */
export function notificationGroup(
  createdAt: Date,
  now: Date,
  timeZone: string,
): NotificationItem['group'] {
  const day = userLocalDay(createdAt, timeZone);
  const today = userLocalDay(now, timeZone);
  if (day === today) return 'today';
  if (day === previousCivilDay(today)) return 'yesterday';
  return 'earlier';
}

interface ProfileRow {
  timezone: string;
}

async function readProfile(tx: DbTx, userId: string): Promise<ProfileRow> {
  const rows = await tx
    .select({ timezone: profiles.timezone })
    .from(profiles)
    .where(eq(profiles.id, userId))
    .limit(1);
  const profile = rows[0];
  if (profile === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  return profile;
}

async function countAll(tx: DbTx, userId: string): Promise<number> {
  const rows = await tx
    .select({ total: sql<number>`count(*)::int` })
    .from(notifications)
    .where(eq(notifications.userId, userId));
  return Math.max(0, rows[0]?.total ?? 0);
}

interface ItemRow {
  id: string;
  type: NotificationItem['type'];
  icon: string;
  title: string;
  body: string;
  href: string;
  formationTitle: string | null;
  createdAt: Date;
  readAt: Date | null;
}

async function readItems(
  tx: DbTx,
  userId: string,
  filter: NotificationFilter,
  limit: number,
  offset: number,
): Promise<ItemRow[]> {
  const scope =
    filter === 'unread'
      ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
      : eq(notifications.userId, userId);
  return tx
    .select({
      id: notifications.id,
      type: notifications.type,
      icon: notifications.icon,
      title: notifications.title,
      body: notifications.body,
      href: notifications.href,
      formationTitle: formations.title,
      createdAt: notifications.createdAt,
      readAt: notifications.readAt,
    })
    .from(notifications)
    .leftJoin(formations, eq(formations.id, notifications.formationId))
    .where(scope)
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit)
    .offset(offset);
}

/** ET-1, ET-3, EF-2 — one page of the authenticated learner's inbox, grouped in his zone. */
export function listNotifications(
  ctx: ServiceContext,
  input: NotificationListQuery,
): Promise<Result<NotificationListDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const query = NotificationListQuery.parse(input);
    return db.run(async (tx) => {
      const profile = await readProfile(tx, userId);
      const now = ctx.clock.now();
      const [rows, total, unreadCount] = await Promise.all([
        readItems(tx, userId, query.filter, query.limit, query.offset),
        countAll(tx, userId),
        countUnreadNotifications(tx, { userId }),
      ]);
      return {
        items: rows.map((row) => ({
          id: row.id,
          type: row.type,
          icon: row.icon,
          title: row.title,
          body: row.body,
          href: row.href,
          formationTitle: row.formationTitle,
          createdAt: row.createdAt.toISOString(),
          readAt: row.readAt === null ? null : row.readAt.toISOString(),
          group: notificationGroup(row.createdAt, now, profile.timezone),
        })),
        total: Math.max(0, total),
        unreadCount: Math.max(0, unreadCount),
        timezone: profile.timezone,
      };
    });
  });
}

/** ET-1 — the badge count of the authenticated learner, never negative. */
export function getUnreadNotificationCount(
  ctx: ServiceContext,
): Promise<Result<NotificationUnreadCountDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run(async (tx) => {
      const count = await countUnreadNotifications(tx, { userId });
      return { count: Math.max(0, count) };
    });
  });
}

/**
 * ET-2, CL-1, CA-4 — marks one notification of the learner read. A foreign identifier answers
 * `NOT_FOUND` without revealing whether it exists; an already-read notification writes nothing and
 * still returns the current count, so a second call is idempotent.
 */
export function markNotificationRead(
  ctx: ServiceContext,
  notificationId: string,
): Promise<Result<NotificationReadDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run(async (tx) => {
      const existing = await getNotification(tx, { userId, notificationId });
      if (existing === null) throw new AppError('NOT_FOUND', 'Notification introuvable.');
      if (existing.readAt === null) {
        await markNotificationReadRow(tx, { userId, notificationId, readAt: ctx.clock.now() });
      }
      const unreadCount = await countUnreadNotifications(tx, { userId });
      return { unreadCount: Math.max(0, unreadCount) };
    });
  });
}

/**
 * ET-2, EF-3 — marks every unread notification of the learner read. The repository only targets
 * rows whose `read_at` is null, so a second invocation writes nothing and the count never goes
 * below zero.
 */
export function markAllRead(ctx: ServiceContext): Promise<Result<NotificationReadDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run(async (tx) => {
      await markAllNotificationsRead(tx, { userId, readAt: ctx.clock.now() });
      const unreadCount = await countUnreadNotifications(tx, { userId });
      return { unreadCount: Math.max(0, unreadCount) };
    });
  });
}
