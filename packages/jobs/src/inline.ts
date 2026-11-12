// In-process execution of the jobs (SPEC-203 ET-3, EF-6, ADR-0122). With `JOBS_MODE=inline` an
// emitted event does not go to Inngest: every registered function whose trigger matches runs here,
// step by step, with the `InngestTestEngine` of `@inngest/test` (real step bodies). Sleeps resolve
// at once and a failing step is retried (at most four executions for three retries), the steps
// already completed being replayed from memory, never run twice. Errors are logged and never reach
// the emitter. Events produced by the functions follow the same path, five levels deep at most.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

import type { InngestFunction } from 'inngest';

import { clock } from '@learny/core';
import { logger } from '@learny/core/server';

export const MAX_INLINE_DEPTH = 5;
export const MAX_INLINE_EXECUTIONS = 4;
const SEEN_LIMIT = 10_000;

export interface InlineEvent {
  id: string;
  name: string;
  data: Record<string, unknown>;
  ts: number;
}

export interface InlineRun {
  functionId: string;
  status: 'completed' | 'failed';
  /** Executions of the function body (1 + retries actually used). */
  executions: number;
  /** How many times the body of each `step.run` ran (a replayed step is not counted). */
  stepRuns: Record<string, number>;
  output?: unknown;
  error?: { name: string; message: string };
}

export interface InlineHooks {
  /** Receives the events a function sends (`step.sendEvent`). Defaults to the inline dispatcher. */
  sendEvents?: (events: InlineEvent[]) => Promise<void>;
}

type AnyFunction = InngestFunction.Any;
type Trigger = { event?: string | { name?: string; event?: string }; cron?: string };
type Json = Record<string, unknown>;

let registry: readonly AnyFunction[] = [];
const seen = new Set<string>();
const depthStore = new AsyncLocalStorage<{ depth: number }>();

/** Declares the functions the inline dispatcher can run (set by the registry module). */
export function setInlineRegistry(functions: readonly AnyFunction[]): void {
  registry = functions;
}

/** Forgets the event identifiers already executed (tests). */
export function resetInlineState(): void {
  seen.clear();
}

function triggersOf(fn: AnyFunction): Trigger[] {
  return (fn.opts as { triggers?: Trigger[] }).triggers ?? [];
}

export function triggerEventName(trigger: Trigger): string | undefined {
  const event = trigger.event;
  if (typeof event === 'string') return event;
  return event?.name ?? event?.event;
}

function matching(name: string): AnyFunction[] {
  return registry.filter((fn) => triggersOf(fn).some((t) => triggerEventName(t) === name));
}

function normalize(raw: unknown): InlineEvent[] {
  const list = Array.isArray(raw) ? raw : [raw];
  return (list as Json[]).map((event) => ({
    id: typeof event.id === 'string' ? event.id : randomUUID(),
    name: String(event.name),
    data: (event.data as Json | undefined) ?? {},
    ts: typeof event.ts === 'number' ? event.ts : clock.now().getTime(),
  }));
}

interface Recordable {
  run: (id: unknown, fn: () => unknown, ...rest: unknown[]) => unknown;
  [key: string]: unknown;
}

/**
 * Runs `fn` for one event until it completes, fails for good, or exhausts its executions.
 * Used by the inline dispatcher and by the integration tests of the crons (direct execution).
 */
export async function executeFunctionInline(
  fn: AnyFunction,
  event: InlineEvent,
  hooks: InlineHooks = {},
): Promise<InlineRun> {
  const { InngestTestEngine } = await import('@inngest/test');
  const functionId = (fn.opts as { id: string }).id;
  const retries = (fn.opts as { retries?: number }).retries ?? 3;
  const maxExecutions = Math.min(retries + 1, MAX_INLINE_EXECUTIONS);
  const send = hooks.sendEvents ?? dispatchInline;
  // Results of the steps already completed, replayed on the next execution instead of re-run.
  const completed = new Map<string, unknown>();
  const stepRuns: Record<string, number> = {};

  const transformCtx = (ctx: { step: Recordable } & Json) => {
    const step = ctx.step;
    const realRun = step.run.bind(step);
    // A real step: its body runs once, then the engine and `completed` replay its result.
    const run = (id: unknown, body: () => unknown, ...rest: unknown[]) => {
      const name = typeof id === 'string' ? id : (id as { id: string }).id;
      return realRun(
        id,
        async () => {
          stepRuns[name] = (stepRuns[name] ?? 0) + 1;
          const value = await body();
          completed.set(name, value);
          return value;
        },
        ...rest,
      );
    };
    return {
      ...ctx,
      step: {
        ...step,
        run,
        sleep: () => Promise.resolve(null),
        sleepUntil: () => Promise.resolve(null),
        waitForEvent: () => Promise.resolve(null),
        // `step.sendEvent` is a step too: re-running the handler after the next step must not
        // send the events again.
        sendEvent: (id: unknown, payload: unknown) =>
          run(id, async () => {
            const events = normalize(payload);
            await send(events);
            return { ids: events.map((sent) => sent.id) };
          }),
      },
    };
  };

  let executions = 0;
  let last: InlineRun['error'];
  for (let index = 0; index < maxExecutions; index += 1) {
    executions += 1;
    const engine = new InngestTestEngine({
      function: fn,
      transformCtx: transformCtx as never,
    });
    const outcome = await engine.execute({
      events: [{ id: event.id, name: event.name, data: event.data, ts: event.ts }],
      steps: [...completed].map(([id, data]) => ({ id, handler: () => data })),
    });
    const failure = outcome.error as { name?: unknown; message?: unknown } | null | undefined;
    if (failure === undefined || failure === null) {
      return { functionId, status: 'completed', executions, stepRuns, output: outcome.result };
    }
    last = { name: String(failure.name), message: String(failure.message) };
    if (last.name === 'NonRetriableError') break;
  }
  return {
    functionId,
    status: 'failed',
    executions,
    stepRuns,
    ...(last === undefined ? {} : { error: last }),
  };
}

/**
 * Executes the functions subscribed to each event, in order. An event identifier already executed
 * in this process is ignored (a replay triggers a single execution, CL-3).
 */
export async function dispatchInline(events: readonly InlineEvent[]): Promise<void> {
  const depth = (depthStore.getStore()?.depth ?? 0) + 1;
  if (depth > MAX_INLINE_DEPTH) {
    logger.error('inline dispatch depth exceeded', { outcome: 'inline_depth_exceeded' });
    return;
  }
  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    if (seen.size > SEEN_LIMIT) seen.delete(seen.values().next().value as string);
    for (const fn of matching(event.name)) {
      const run = await depthStore.run({ depth }, () =>
        executeFunctionInline(fn, event, { sendEvents: dispatchInline }).catch(
          (error: unknown): InlineRun => ({
            functionId: (fn.opts as { id: string }).id,
            status: 'failed',
            executions: 0,
            stepRuns: {},
            error: {
              name: error instanceof Error ? error.name : 'Error',
              message: 'exécution impossible',
            },
          }),
        ),
      );
      if (run.status === 'failed') {
        logger.error('inline function failed', {
          outcome: 'inline_function_failed',
          job: run.functionId,
          code: run.error?.name ?? 'Error',
        });
      }
    }
  }
}
