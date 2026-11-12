// Hourly tick (SPEC-203 ET-5, ADR-0067, ADR-0123): at minute 5 of every UTC hour it resends the
// pending outbox events, then fans out one `user/local-tick` per active user describing the local
// window `[T − 5 min, T + 55 min[`, and finally emits the global `cron/hourly-tick`.
import { defineFunction } from '../define';
import { dispatchPending } from '../emit';
import {
  type TickUser,
  TICK_PAGE_SIZE,
  buildLocalTick,
  localTickEventId,
  selectTickUsers,
  tickInstant,
} from '../tick';

export const CRON_HOURLY_TICK_ID = 'cron-hourly-tick';
export const HOURLY_TICK_CRON = 'TZ=UTC 5 * * * *';

export const cronHourlyTick = defineFunction(
  { id: CRON_HOURLY_TICK_ID, trigger: { cron: HOURLY_TICK_CRON }, retries: 1 },
  async ({ step, ctx, logger }) => {
    // T is fixed once: a replay after a step must not see another minute.
    const tickAt = await step.run('tick-instant', () =>
      Promise.resolve(tickInstant(ctx.clock.now()).toISOString()),
    );
    const tick = new Date(tickAt);

    const outbox = await step.run('dispatch-outbox', () => dispatchPending(500));

    let cursor: string | null = null;
    let users = 0;
    for (let page = 0; ; page += 1) {
      const after: string | null = cursor;
      const selected: TickUser[] = await step.run(`select-users-${String(page)}`, () =>
        selectTickUsers(ctx.sdb, tick, after),
      );
      if (selected.length === 0) break;
      const events = selected.flatMap((user) => {
        const data = buildLocalTick(user, tick);
        if (data === null) {
          logger.warn('local tick skipped: invalid time zone', { outcome: 'invalid_timezone' });
          return [];
        }
        return [{ id: localTickEventId(data), name: 'user/local-tick' as const, data }];
      });
      if (events.length > 0) await step.sendEvent(`fan-out-${String(page)}`, events);
      users += events.length;
      cursor = selected[selected.length - 1]?.userId ?? null;
      if (selected.length < TICK_PAGE_SIZE) break;
    }

    await step.sendEvent('global', {
      id: `hourly-tick:${tickAt}`,
      name: 'cron/hourly-tick',
      data: { tickAt },
    });
    return { tickAt, users, outbox };
  },
);
