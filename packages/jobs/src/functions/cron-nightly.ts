// Nightly cron (SPEC-203 ET-6, ADR-0067): at 01:30 UTC it emits `cron/nightly`. Every nightly
// treatment is its own function subscribed to that event, so one failure never blocks the others.
import { defineFunction } from '../define';

export const CRON_NIGHTLY_ID = 'cron-nightly';
export const NIGHTLY_CRON = 'TZ=UTC 30 1 * * *';

export const cronNightly = defineFunction(
  { id: CRON_NIGHTLY_ID, trigger: { cron: NIGHTLY_CRON } },
  async ({ step, ctx }) => {
    // The run date is fixed once: a replay after midnight keeps the same identifier.
    const runDate = await step.run('run-date', () =>
      Promise.resolve(ctx.clock.now().toISOString().slice(0, 10)),
    );
    await step.sendEvent('emit-nightly', {
      id: `nightly:${runDate}`,
      name: 'cron/nightly',
      data: { runDate },
    });
    return { runDate };
  },
);
