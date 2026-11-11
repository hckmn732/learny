// SDD demonstration job: two stable, idempotent steps (ADR-0017, SPEC-007 EF-4).
import type { Inngest } from 'inngest';

import { clock, type Clock } from '@learny/core';

import type { DemoResultStore } from '../demo-store';
import { PermanentJobError, errorCode, isPermanentError } from '../errors';
import { demoJobInputSchema, sddDemoJobRequested } from '../events';
import { silentLogger, type JobLogger, type StepTools } from '../ports';

export const DEMO_JOB_ID = 'sdd-demo-job';
export const DEMO_JOB_NAME = 'sdd/demo-job';
// Three retries with the Inngest backoff (ADR-0017).
export const JOB_RETRIES = 3;
// Stable step names: never derived from user values (ET-5).
export const DEMO_STEPS = ['validate-input', 'persist-result'] as const;
export type DemoStepName = (typeof DEMO_STEPS)[number];

export interface DemoJobDeps {
  store: DemoResultStore;
  clock?: Clock;
}

export interface DemoJobResult {
  runId: string;
  doubledValue: number;
}

export interface DemoJobContext {
  data: unknown;
  step: StepTools;
  logger?: JobLogger;
}

function conflict(): PermanentJobError {
  return new PermanentJobError('IDEMPOTENCY_CONFLICT', 'runId déjà utilisé avec une autre valeur.');
}

async function inStep<T>(
  step: StepTools,
  logger: JobLogger,
  name: DemoStepName,
  runId: string,
  fn: () => Promise<T>,
): Promise<T> {
  return step.run(name, async () => {
    try {
      return await fn();
    } catch (error) {
      // Safe log: step, run identifier and error code only, never the input value.
      const fields = { job: DEMO_JOB_NAME, step: name, runId, code: errorCode(error) };
      if (isPermanentError(error)) logger.error('job step failed permanently', fields);
      else logger.warn('job step failed, will be retried', fields);
      throw error;
    }
  });
}

export async function runDemoJob(ctx: DemoJobContext, deps: DemoJobDeps): Promise<DemoJobResult> {
  const logger = ctx.logger ?? silentLogger;
  // The input is validated before the first step: nothing is written on failure (CL-1).
  const parsed = demoJobInputSchema.safeParse(ctx.data);
  if (!parsed.success) {
    logger.error('job input rejected', { job: DEMO_JOB_NAME, code: 'VALIDATION_FAILED' });
    throw new PermanentJobError('VALIDATION_FAILED', 'Entrée du job invalide.');
  }
  const { runId, value } = parsed.data;

  const checked = await inStep(ctx.step, logger, 'validate-input', runId, async () => {
    const existing = await deps.store.find(runId);
    if (existing !== undefined && existing.value !== value) throw conflict();
    return { runId, value, doubledValue: value * 2 };
  });

  const persisted = await inStep(ctx.step, logger, 'persist-result', runId, async () => {
    // Idempotent on runId: a second delivery returns the stored result (CL-2).
    const existing = await deps.store.find(checked.runId);
    if (existing !== undefined) {
      if (existing.value !== checked.value) throw conflict();
      return { runId: existing.runId, doubledValue: existing.doubledValue };
    }
    await deps.store.insert({
      runId: checked.runId,
      value: checked.value,
      doubledValue: checked.doubledValue,
      persistedAt: (deps.clock ?? clock).now().toISOString(),
    });
    return { runId: checked.runId, doubledValue: checked.doubledValue };
  });

  logger.info('job completed', { job: DEMO_JOB_NAME, runId });
  return persisted;
}

export function toJobLogger(logger: {
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}): JobLogger {
  return {
    info: (message, fields) => {
      logger.info(message, fields);
    },
    warn: (message, fields) => {
      logger.warn(message, fields);
    },
    error: (message, fields) => {
      logger.error(message, fields);
    },
  };
}

export function createDemoJob(client: Inngest, deps: DemoJobDeps) {
  return client.createFunction(
    {
      id: DEMO_JOB_ID,
      name: DEMO_JOB_NAME,
      retries: JOB_RETRIES,
      triggers: [sddDemoJobRequested],
    },
    async ({ event, step }) =>
      runDemoJob(
        {
          data: event.data,
          // Step results are plain JSON objects: Inngest's Jsonify<T> is T here.
          step: {
            run: <T>(name: string, fn: () => Promise<T>) => step.run(name, fn) as Promise<T>,
          },
          logger: toJobLogger(client.logger),
        },
        deps,
      ),
  );
}
