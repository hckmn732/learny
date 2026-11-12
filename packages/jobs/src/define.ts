// Conventions of the Inngest functions of Learny (SPEC-203 ET-4, ADR-0017).
//
// Normative rules for every handler written with `defineFunction`:
//  - every write and every external call runs inside `step.run('<stable-name>', …)`;
//  - every step is idempotent (upsert on a natural key, or a state check before writing);
//  - a business error that must not be retried throws `NonRetriableError`;
//  - a step never reads `Date`: it reads `ctx.clock.now()` (ADR-0047);
//  - three retries with the default Inngest backoff; a final failure is reported (SPEC-010) with
//    `functionId`, `eventId` and `userId`.
import { NonRetriableError, type Context } from 'inngest';

import { EVENTS, parseEventData, type EventData, type EventName } from '@learny/contracts';
import type { LearnyLogger } from '@learny/core';
import { logger as rootLogger } from '@learny/core/server';

import { inngest } from './client';
import { createJobContext, type JobContext } from './context';
import { reportJobError } from './ports';

export const DEFAULT_RETRIES = 3;
const DEFAULT_CONCURRENCY_LIMIT = 5;

export type JobStep = Context.Any['step'];

export interface JobEvent<N extends string = EventName> {
  id: string;
  name: N;
  data: N extends EventName ? EventData<N> : Record<string, unknown>;
  ts: number;
}

export interface FunctionConfig<N extends EventName> {
  /** kebab-case, stable: it identifies the function across deployments. */
  id: string;
  trigger: { event: N } | { cron: string };
  retries?: 0 | 1 | 2 | 3;
  /** Defaults to `{ key: 'event.data.userId', limit: 5 }` when the event carries a `userId`. */
  concurrency?: { key?: string; limit: number };
  /** CEL expression over the event, e.g. `event.data.exportId`. */
  idempotency?: string;
}

export interface FunctionArgs<N extends EventName> {
  event: JobEvent<N>;
  step: JobStep;
  logger: LearnyLogger;
  ctx: JobContext;
}

const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

function carriesUserId(name: EventName): boolean {
  return 'userId' in EVENTS[name].shape;
}

function isFinalFailure(error: unknown, attempt: number, retries: number): boolean {
  if (error instanceof NonRetriableError) return true;
  if (error instanceof Error && error.name === 'StepError') return true;
  return attempt >= retries;
}

export function defineFunction<N extends EventName>(
  cfg: FunctionConfig<N>,
  handler: (args: FunctionArgs<N>) => Promise<unknown>,
) {
  if (!KEBAB_CASE.test(cfg.id)) {
    throw new Error(`Identifiant de fonction invalide (kebab-case attendu) : ${cfg.id}`);
  }
  const retries = cfg.retries ?? DEFAULT_RETRIES;
  const eventName = 'event' in cfg.trigger ? cfg.trigger.event : undefined;
  const concurrency =
    cfg.concurrency ??
    (eventName !== undefined && carriesUserId(eventName)
      ? { key: 'event.data.userId', limit: DEFAULT_CONCURRENCY_LIMIT }
      : undefined);

  return inngest.createFunction(
    {
      id: cfg.id,
      name: cfg.id,
      retries,
      triggers: [cfg.trigger],
      ...(concurrency === undefined ? {} : { concurrency }),
      ...(cfg.idempotency === undefined ? {} : { idempotency: cfg.idempotency }),
    },
    async ({ event, step, runId, attempt }) => {
      const eventId = typeof event.id === 'string' ? event.id : runId;
      let data: unknown = event.data;
      if (eventName !== undefined) {
        const checked = EVENTS[eventName].safeParse(event.data);
        if (!checked.success) {
          const error = new NonRetriableError(`Données de l'événement ${eventName} invalides.`);
          reportJobError({ job: cfg.id, jobId: runId, eventId, error });
          throw error;
        }
        data = parseEventData(eventName, event.data);
      }
      const userId =
        typeof (data as { userId?: unknown } | null)?.userId === 'string'
          ? (data as { userId: string }).userId
          : undefined;
      const logger = rootLogger.child({ jobId: runId });
      const ctx = createJobContext({ requestId: runId, logger });
      try {
        return await handler({
          event: {
            id: eventId,
            name: (eventName ?? event.name) as N,
            data: data as JobEvent<N>['data'],
            ts: typeof event.ts === 'number' ? event.ts : 0,
          },
          step,
          logger,
          ctx,
        });
      } catch (error) {
        if (isFinalFailure(error, attempt, retries)) {
          logger.error('job failed', { job: cfg.id, outcome: 'job_failed', attempt });
          reportJobError({
            job: cfg.id,
            jobId: runId,
            attempt,
            eventId,
            ...(userId === undefined ? {} : { userId }),
            error,
          });
        }
        throw error;
      }
    },
  );
}
