// Demonstration services of SPEC-203: the pipeline emitted through the outbox, and a manual run of
// the hourly tick limited to the factory users (e-mail prefix `sdd-203-`).
import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';

import type {
  DemoPipelineInput,
  DemoRunStatus,
  HourlyTickInput,
  HourlyTickOutput,
  OutboxCounts,
} from '@learny/contracts';
import { AppError, zonedParts } from '@learny/core';
import { schema, serviceDb } from '@learny/db';
import { buildLocalTick, emitAfterCommit, selectTickUsers, tickInstant } from '@learny/jobs';

import type { ServiceContext } from '../context';

const { eventOutbox, sddDemoRuns } = schema;

/** Prefix of the e-mail addresses of the factory users shown by the tick demonstration. */
export const SDD_203_USER_PREFIX = 'sdd-203-';
const PAGE_SIZE = 500;

/** Emits `sdd/demo-requested` in a transaction of its own; the pipeline then runs (ET-7). */
export async function startDemoPipeline(
  ctx: ServiceContext,
  input: DemoPipelineInput,
): Promise<{ jobId: string }> {
  if (ctx.db === null) throw new AppError('UNAUTHENTICATED', 'Vous devez être connecté.');
  const runId = randomUUID();
  await emitAfterCommit(
    ctx.db,
    'sdd/demo-requested',
    { runId, failOnceAt: input.failOnceAt },
    { id: `sdd-demo:${runId}` },
  );
  return { jobId: runId };
}

/** State of a run; a run whose pipeline has not started yet reads as empty (asynchronous). */
export async function getDemoRun(_ctx: ServiceContext, runId: string): Promise<DemoRunStatus> {
  const [row] = await serviceDb().select().from(sddDemoRuns).where(eq(sddDemoRuns.runId, runId));
  if (row === undefined) return { runId, steps: [], attempts: 0, finishedAt: null };
  return {
    runId: row.runId,
    steps: row.steps,
    attempts: row.attempts,
    finishedAt: row.finishedAt === null ? null : row.finishedAt.toISOString(),
  };
}

/** Local windows of the factory users selected by the tick at `input.at` (default: now). */
export async function previewHourlyTick(
  ctx: ServiceContext,
  input: HourlyTickInput,
): Promise<HourlyTickOutput> {
  const tick = tickInstant(input.at === undefined ? ctx.clock.now() : new Date(input.at));
  const users: HourlyTickOutput['users'] = [];
  let cursor: string | null = null;
  for (;;) {
    const page = await selectTickUsers(serviceDb(), tick, cursor, {
      limit: PAGE_SIZE,
      emailPrefix: SDD_203_USER_PREFIX,
    });
    for (const user of page) {
      const data = buildLocalTick(user, tick);
      if (data === null) continue;
      const local = zonedParts(data.windowStart, data.timezone);
      users.push({
        ...data,
        localStart: `${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')}`,
      });
    }
    if (page.length < PAGE_SIZE) break;
    cursor = page[page.length - 1]?.userId ?? null;
  }
  return { tickAt: tick.toISOString(), users };
}

/** Pending, sent and failed events of the caller's outbox rows (the demonstration owns its own). */
export async function getOutboxCounts(ctx: ServiceContext): Promise<OutboxCounts> {
  if (ctx.userId === null) throw new AppError('UNAUTHENTICATED', 'Vous devez être connecté.');
  const [row] = await serviceDb()
    .select({
      pending: sql<number>`count(*) filter (where ${eventOutbox.sentAt} is null and not ${eventOutbox.failed})::int`,
      sent: sql<number>`count(*) filter (where ${eventOutbox.sentAt} is not null)::int`,
      failed: sql<number>`count(*) filter (where ${eventOutbox.failed})::int`,
    })
    .from(eventOutbox)
    .where(eq(eventOutbox.userId, ctx.userId));
  return { pending: row?.pending ?? 0, sent: row?.sent ?? 0, failed: row?.failed ?? 0 };
}
