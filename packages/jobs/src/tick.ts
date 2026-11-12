// Selection of the users of an hourly tick and construction of their local windows
// (SPEC-203 ET-5, ADR-0123). Shared by the `cron-hourly-tick` function and the SDD demonstration.
import { and, asc, gt, inArray, isNull, like, or } from 'drizzle-orm';

import type { EventData } from '@learny/contracts';
import { zonedParts } from '@learny/core';
import { schema, type Db } from '@learny/db';

const { profiles } = schema;

export const TICK_PAGE_SIZE = 500;
/** Window of a tick at T: `[T − 5 min, T + 55 min[`. */
export const WINDOW_BEFORE_MS = 5 * 60_000;
export const WINDOW_AFTER_MS = 55 * 60_000;
/** Onboarding steps from which a user is active: the reminders step is the first to need ticks. */
export const ACTIVE_ONBOARDING_STEPS = ['rappels', 'depart', 'done'] as const;

export interface TickUser {
  userId: string;
  timezone: string;
}

export type LocalTickData = EventData<'user/local-tick'>;

/** T: the instant of the tick, truncated to the minute. */
export function tickInstant(now: Date): Date {
  return new Date(Math.floor(now.getTime() / 60_000) * 60_000);
}

/**
 * One page of active users after `after` (excluded), by identifier: users still onboarding before
 * the reminders step and users whose deletion date has passed are not selected (CL-8).
 */
export async function selectTickUsers(
  db: Db,
  tick: Date,
  after: string | null,
  options: { limit?: number; emailPrefix?: string } = {},
): Promise<TickUser[]> {
  const rows = await db
    .select({ userId: profiles.id, timezone: profiles.timezone })
    .from(profiles)
    .where(
      and(
        inArray(profiles.onboardingStep, [...ACTIVE_ONBOARDING_STEPS]),
        or(isNull(profiles.deletionScheduledFor), gt(profiles.deletionScheduledFor, tick)),
        after === null ? undefined : gt(profiles.id, after),
        options.emailPrefix === undefined
          ? undefined
          : like(profiles.email, `${options.emailPrefix}%`),
      ),
    )
    .orderBy(asc(profiles.id))
    .limit(options.limit ?? TICK_PAGE_SIZE);
  return rows;
}

/** Local window of `user` for the tick at `tick`; `null` when the stored zone is not valid. */
export function buildLocalTick(user: TickUser, tick: Date): LocalTickData | null {
  const start = new Date(tick.getTime() - WINDOW_BEFORE_MS);
  const end = new Date(tick.getTime() + WINDOW_AFTER_MS);
  try {
    const local = zonedParts(start, user.timezone);
    return {
      userId: user.userId,
      timezone: user.timezone,
      windowStart: start.toISOString(),
      windowEnd: end.toISOString(),
      localDate: local.localDate,
      localWeekday: local.weekday,
    };
  } catch {
    return null;
  }
}

/** Inngest event identifier of a local tick: one per user and window (CL-7). */
export function localTickEventId(data: LocalTickData): string {
  return `local-tick:${data.userId}:${data.windowStart}`;
}
