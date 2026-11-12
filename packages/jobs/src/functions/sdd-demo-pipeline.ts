// Demonstration pipeline of SPEC-203 (ET-7): three idempotent steps, the second one failing on
// its first execution when asked, to show that Inngest retries only that step.
import { eq, sql } from 'drizzle-orm';

import { schema } from '@learny/db';

import { defineFunction, type FunctionArgs } from '../define';

const { sddDemoRuns } = schema;

export const SDD_DEMO_PIPELINE_ID = 'sdd-demo-pipeline';
export const DEMO_STEP_NAMES = ['step-1-prepare', 'step-2-process', 'step-3-finish'] as const;
export type DemoStepName = (typeof DEMO_STEP_NAMES)[number];

/** Appends a step to the run unless it is already recorded (idempotent on the step name). */
async function recordStep(
  ctx: FunctionArgs<'sdd/demo-requested'>['ctx'],
  runId: string,
  name: DemoStepName,
  extra: { finished?: boolean } = {},
): Promise<void> {
  const entry = JSON.stringify([{ name, at: ctx.clock.now().toISOString() }]);
  const marker = JSON.stringify([{ name }]);
  await ctx.sdb
    .update(sddDemoRuns)
    .set({
      steps: sql`case when ${sddDemoRuns.steps} @> ${marker}::jsonb then ${sddDemoRuns.steps} else ${sddDemoRuns.steps} || ${entry}::jsonb end`,
      ...(extra.finished === true ? { finishedAt: ctx.clock.now() } : {}),
    })
    .where(eq(sddDemoRuns.runId, runId));
}

export const sddDemoPipeline = defineFunction(
  {
    id: SDD_DEMO_PIPELINE_ID,
    trigger: { event: 'sdd/demo-requested' },
    retries: 3,
    idempotency: 'event.data.runId',
    concurrency: { key: 'event.data.runId', limit: 1 },
  },
  async ({ event, step, ctx }) => {
    const { runId, failOnceAt } = event.data;

    await step.run('step-1-prepare', async () => {
      await ctx.sdb.insert(sddDemoRuns).values({ runId }).onConflictDoNothing();
      await recordStep(ctx, runId, 'step-1-prepare');
    });

    await step.run('step-2-process', async () => {
      // The counter lives in the database: it survives the retry of this step.
      const [row] = await ctx.sdb
        .update(sddDemoRuns)
        .set({ attempts: sql`${sddDemoRuns.attempts} + 1` })
        .where(eq(sddDemoRuns.runId, runId))
        .returning({ attempts: sddDemoRuns.attempts });
      if (failOnceAt === 'step-2' && row?.attempts === 1) {
        throw new Error('Échec simulé de l’étape 2 (première exécution).');
      }
      await recordStep(ctx, runId, 'step-2-process');
    });

    await step.run('step-3-finish', async () => {
      await recordStep(ctx, runId, 'step-3-finish', { finished: true });
    });

    return { runId };
  },
);
