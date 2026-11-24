// Groups of the notification centre (SPEC-3102 BR-NOT-01, EF-3).
//
// The API already resolves the group of every row in the zone of the learner (service of the
// notification centre). This module owns the *presentation* of those groups: their order, their
// heading, and the derivation used when a row comes from an older cached page that carries no
// group — the day boundary is then read in the user's zone, never in UTC.
import { zonedParts } from '@learny/core';
import { fr } from '@learny/i18n';

import { FALLBACK_TIME_ZONE } from '../../lib/dates';

/** Order of the three groups of the mockup (BR-NOT-01). */
export const NOTIFICATION_GROUP_ORDER = ['today', 'yesterday', 'earlier'] as const;

export type NotificationGroup = (typeof NOTIFICATION_GROUP_ORDER)[number];

/** A row as the sheet receives it: the API group is optional (older cached pages). */
export interface GroupableNotification {
  readonly id: string;
  readonly createdAt: string;
  readonly group?: NotificationGroup | undefined;
}

export interface NotificationGroupSection<T extends GroupableNotification> {
  readonly group: NotificationGroup;
  readonly label: string;
  readonly items: readonly T[];
}

/** `YYYY-MM-DD` day of an instant, read in `timeZone` (ET-5, BR-ACC-07). */
export function dayKey(instant: Date | string, timeZone: string = FALLBACK_TIME_ZONE): string {
  return zonedParts(instant, timeZone).localDate;
}

/** Shifts a `YYYY-MM-DD` day by `days` calendar days, without reading the device zone. */
export function shiftDay(day: string, days: number): string {
  const [year, month, date] = day.split('-').map((part) => Number(part));
  const shifted = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (date ?? 1) + days));
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${String(shifted.getUTCFullYear())}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** Group of a row's day: today, the day before, or anything older (BR-NOT-01). */
export function groupOfDay(
  day: string,
  today: string = day,
  yesterday: string = shiftDay(today, -1),
): NotificationGroup {
  if (day === today) return 'today';
  if (day === yesterday) return 'yesterday';
  return 'earlier';
}

/** Heading of a group, as the shared catalogue writes it (identical to the web). */
export function groupLabel(group: NotificationGroup): string {
  return fr.shell.notifications.groups[group];
}

/**
 * Splits rows into the three groups, in the order of the mockup. The group sent by the API is
 * authoritative; a row without one is derived from its day in the zone of the learner.
 */
export function groupNotifications<T extends GroupableNotification>(
  items: readonly T[],
  timeZone: string = FALLBACK_TIME_ZONE,
  now: Date | string,
): readonly NotificationGroupSection<T>[] {
  const today = dayKey(now, timeZone);
  const yesterday = shiftDay(today, -1);
  return NOTIFICATION_GROUP_ORDER.map((group) => ({
    group,
    label: groupLabel(group),
    items: items.filter(
      (item) =>
        (item.group ?? groupOfDay(dayKey(item.createdAt, timeZone), today, yesterday)) === group,
    ),
  })).filter((section) => section.items.length > 0);
}

/** Number of unread rows of a page (BR-NOT-01); never negative. */
export function unreadCountOf(items: readonly { readonly readAt: string | null }[]): number {
  return items.filter((item) => item.readAt === null).length;
}
