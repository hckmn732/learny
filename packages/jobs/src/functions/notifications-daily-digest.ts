// Programme du jour (SPEC-209 EF-6, ET-6, ADR-0123). After every hourly tick, each active learner
// whose local window contains their `digest_time` waits until that instant and receives the
// `daily_digest` notification with the day's agenda and the previous day's capped sends. The
// notification identifier includes the local date, so a replay never duplicates it (CA-4).
import { eq } from 'drizzle-orm';

import { notificationSettings } from '@learny/db';
import { sendDailyDigest } from '@learny/notifications';

import { defineFunction } from '../define';
import { buildLocalTick, selectTickUsers, type TickUser } from '../tick';
import { dueInWindow } from '../time-window';

export const NOTIFICATIONS_DAILY_DIGEST_ID = 'notifications-daily-digest';

export const notificationsDailyDigest = defineFunction(
  {
    id: NOTIFICATIONS_DAILY_DIGEST_ID,
    trigger: { event: 'cron/hourly-tick' },
    idempotency: 'event.data.tickAt',
    retries: 1,
  },
  async ({ event, step, ctx, logger }) => {
    const tick = new Date(event.data.tickAt);
    let cursor: string | null = null;
    let digests = 0;
    for (let page = 0; ; page += 1) {
      const after: string | null = cursor;
      const users: TickUser[] = await step.run(`select-users-${String(page)}`, () =>
        selectTickUsers(ctx.sdb, tick, after),
      );
      if (users.length === 0) break;
      for (const user of users) {
        const due = await step.run(`due-${user.userId}`, async () => {
          const [settings] = await ctx.sdb
            .select({ digestTime: notificationSettings.digestTime })
            .from(notificationSettings)
            .where(eq(notificationSettings.userId, user.userId))
            .limit(1);
          const local = buildLocalTick(user, tick);
          if (local === null || settings === undefined) return null;
          const digestTime = settings.digestTime.slice(0, 5) as `${number}:${number}`;
          const instant = dueInWindow(digestTime, {
            windowStart: local.windowStart,
            windowEnd: local.windowEnd,
            timezone: local.timezone,
          });
          return instant === null ? null : instant.toISOString();
        });
        if (due === null) continue;
        await step.sleepUntil(`sleep-${user.userId}`, new Date(due));
        const outcome = await step.run(`digest-${user.userId}`, () =>
          sendDailyDigest(
            { requestId: ctx.requestId, sdb: ctx.sdb, clock: ctx.clock, logger: ctx.logger },
            { userId: user.userId, at: new Date(due), timeZone: user.timezone },
          ),
        );
        if (outcome.created) digests += 1;
      }
      cursor = users[users.length - 1]?.userId ?? null;
      if (users.length < 500) break;
    }
    logger.info('daily digests computed', { outcome: `created=${String(digests)}` });
    return { digests };
  },
);
