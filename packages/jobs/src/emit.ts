// Transactional emission of the domain events (SPEC-203 ET-2, ADR-0122).
//
// A service never calls `inngest.send` itself: it writes the event in the outbox INSIDE its own
// transaction (`withTransaction`), and the event is sent AFTER the commit. A rolled-back
// transaction therefore sends nothing, a committed one sends at least once, and an Inngest outage
// leaves the row in place until the hourly tick sends it again (10 tries, then `failed`).
//
// Delivery is "at least once" and deduplicated by the Inngest event identifier (24 h): the default
// identifier is `<name>:<sha256 of the canonical data>`, so two *semantically distinct* events with
// identical data must be given an explicit business identifier (`opts.id`, e.g. `user-signed-up:<id>`).
import { createHash } from 'node:crypto';

import { and, asc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';

import {
  EVENTS,
  parseEventData,
  type EventData,
  type EventInput,
  type EventName,
} from '@learny/contracts';
import { AppError, clock, type Clock, type LearnyLogger } from '@learny/core';
import { logger as rootLogger } from '@learny/core/server';
import {
  canonicalJson,
  schema,
  serviceDb,
  type Db,
  type DbTx,
  type UserDatabase,
} from '@learny/db';

import { inngest } from './client';
import { dispatchInline, type InlineEvent } from './inline';
import { resolveJobsMode, type JobsMode } from './mode';
import { reportJobError } from './ports';

export const OUTBOX_BATCH_SIZE = 100;
export const OUTBOX_MAX_ATTEMPTS = 10;
const LAST_ERROR_MAX = 300;

const { eventOutbox } = schema;

export type Tx = DbTx;

export interface EventOutbox {
  /** Validates `data` against the catalogue and queues it; written when the transaction commits. */
  add<N extends EventName>(name: N, data: EventInput<N>, opts?: { id?: string }): void;
}

export interface EventSender {
  send(
    events: { id: string; name: string; data: Record<string, unknown>; ts: number }[],
  ): Promise<unknown>;
}

export interface EmitDeps {
  /** Owner-role client used to read and update the outbox. Defaults to `serviceDb()`. */
  db: Db;
  sender: EventSender;
  clock: Clock;
  logger: LearnyLogger;
  mode: JobsMode;
}

let senderOverride: EventSender | undefined;

/** Replaces the Inngest sender of the default dependencies (integration tests of the crons). */
export function setEventSender(sender: EventSender | undefined): void {
  senderOverride = sender;
}

function defaultDeps(): EmitDeps {
  return {
    db: serviceDb(),
    sender: senderOverride ?? inngest,
    clock,
    logger: rootLogger,
    mode: resolveJobsMode(),
  };
}

interface Queued {
  eventId: string;
  name: EventName;
  data: Record<string, unknown>;
  userId: string | null;
}

/** Default deduplication identifier of an event (ET-2). */
export function defaultEventId(name: string, data: unknown): string {
  const digest = createHash('sha256').update(canonicalJson(data)).digest('hex');
  return `${name}:${digest.slice(0, 32)}`;
}

function userIdOf(data: Record<string, unknown>): string | null {
  return typeof data.userId === 'string' ? data.userId : null;
}

function safeMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : 'Error';
  const message = error instanceof Error ? error.message : String(error);
  // Never the payload nor a stack: the name and a bounded one-line message only.
  return `${name}: ${message}`.replace(/\s+/g, ' ').slice(0, LAST_ERROR_MAX);
}

function toOutbound(row: typeof eventOutbox.$inferSelect): InlineEvent {
  return { id: row.eventId, name: row.name, data: row.data, ts: row.createdAt.getTime() };
}

/** Sends one batch: to Inngest, or in the process when `JOBS_MODE=inline`. */
async function sendBatch(batch: InlineEvent[], deps: EmitDeps): Promise<void> {
  if (deps.mode === 'inline') {
    await dispatchInline(batch);
    return;
  }
  await deps.sender.send(batch);
}

/**
 * Sends the given outbox rows, 100 at a time. A batch that succeeds is marked `sent_at`; one that
 * fails gets `attempts + 1` and `last_error`, and becomes `failed` at the tenth attempt, which is
 * logged and reported (EF-5). Never throws: the commit already happened.
 */
async function dispatchRows(
  rows: (typeof eventOutbox.$inferSelect)[],
  deps: EmitDeps,
): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  for (let offset = 0; offset < rows.length; offset += OUTBOX_BATCH_SIZE) {
    const batch = rows.slice(offset, offset + OUTBOX_BATCH_SIZE);
    const ids = batch.map((row) => row.id);
    try {
      await sendBatch(batch.map(toOutbound), deps);
      await deps.db
        .update(eventOutbox)
        .set({ sentAt: deps.clock.now(), lastError: null })
        .where(and(inArray(eventOutbox.id, ids), isNull(eventOutbox.sentAt)));
      sent += batch.length;
    } catch (error) {
      const message = safeMessage(error);
      const updated = await deps.db
        .update(eventOutbox)
        .set({
          attempts: sql`${eventOutbox.attempts} + 1`,
          lastError: message,
          failed: sql`${eventOutbox.attempts} + 1 >= ${OUTBOX_MAX_ATTEMPTS}`,
        })
        .where(and(inArray(eventOutbox.id, ids), isNull(eventOutbox.sentAt)))
        .returning({ id: eventOutbox.id, failed: eventOutbox.failed, name: eventOutbox.name });
      deps.logger.warn('event dispatch failed', { outcome: 'event_dispatch_failed' }, error);
      for (const row of updated.filter((entry) => entry.failed)) {
        failed += 1;
        deps.logger.error('event outbox entry failed for good', {
          outcome: 'event_outbox_failed',
          operation: row.name,
        });
        reportJobError({ job: 'event-outbox', eventId: row.id, error });
      }
    }
  }
  return { sent, failed };
}

/** Sends the outbox rows with the given event identifiers, when still pending. */
async function dispatchIds(eventIds: string[], deps: EmitDeps): Promise<void> {
  if (eventIds.length === 0) return;
  const rows = await deps.db
    .select()
    .from(eventOutbox)
    .where(
      and(
        inArray(eventOutbox.eventId, eventIds),
        isNull(eventOutbox.sentAt),
        eq(eventOutbox.failed, false),
      ),
    )
    .orderBy(asc(eventOutbox.createdAt));
  await dispatchRows(rows, deps);
}

/**
 * Sends the pending events (oldest first), up to `limit`: called by the hourly tick to resend
 * what an outage left in the outbox (EF-5).
 */
export async function dispatchPending(
  limit = 500,
  deps: Partial<EmitDeps> = {},
): Promise<{ sent: number; failed: number }> {
  const resolved = { ...defaultDeps(), ...deps };
  const rows = await resolved.db
    .select()
    .from(eventOutbox)
    .where(and(isNull(eventOutbox.sentAt), eq(eventOutbox.failed, false)))
    .orderBy(asc(eventOutbox.createdAt))
    .limit(limit);
  return dispatchRows(rows, resolved);
}

/** Deletes the outbox rows sent more than `days` days ago (nightly cleanup). */
export async function purgeSentEvents(days = 7, deps: Partial<EmitDeps> = {}): Promise<number> {
  const resolved = { ...defaultDeps(), ...deps };
  const limit = new Date(resolved.clock.now().getTime() - days * 24 * 60 * 60 * 1000);
  const deleted = await resolved.db
    .delete(eventOutbox)
    .where(lt(eventOutbox.sentAt, limit))
    .returning({ id: eventOutbox.id });
  return deleted.length;
}

function violation(name: string, deps: EmitDeps): AppError {
  // Safe log: the event name only, never the data (it may carry personal information).
  deps.logger.error('event schema violation', {
    outcome: 'event_schema_violation',
    operation: name,
  });
  return new AppError('INTERNAL_ERROR', `Événement ${name} invalide : il n'est pas émis.`);
}

function isUserDatabase(db: Db | UserDatabase): db is UserDatabase {
  return 'run' in db && typeof db.run === 'function';
}

/**
 * Runs `fn` in a transaction (the user's when `db` is a `UserDatabase`, the service's when it is
 * a `Db`) and gives it an outbox: events added during `fn` are written inside the same transaction
 * and sent after the commit. If `fn` throws, nothing is written and nothing is sent (CL-1, CL-10).
 */
export async function withTransaction<T>(
  db: Db | UserDatabase,
  fn: (tx: Tx, outbox: EventOutbox) => Promise<T>,
  deps: Partial<EmitDeps> = {},
): Promise<T> {
  const resolved = { ...defaultDeps(), ...deps };
  const queued: Queued[] = [];
  const outbox: EventOutbox = {
    add(name, data, opts) {
      const schemaOfEvent = EVENTS[name];
      const checked = schemaOfEvent.safeParse(data);
      if (!checked.success) throw violation(name, resolved);
      const parsed = parseEventData(name, data) as EventData<typeof name> & Record<string, unknown>;
      queued.push({
        eventId: opts?.id ?? defaultEventId(name, parsed),
        name,
        data: parsed,
        userId: userIdOf(parsed),
      });
    },
  };

  const body = async (tx: Tx): Promise<T> => {
    const result = await fn(tx, outbox);
    // Written in the transaction: they commit or roll back together with the business writes.
    for (const event of queued) {
      await tx.execute(
        sql`select public.enqueue_event(${event.eventId}, ${event.name}, ${JSON.stringify(event.data)}::jsonb, ${event.userId}::uuid)`,
      );
    }
    return result;
  };
  const result = isUserDatabase(db) ? await db.run(body) : await db.transaction(body);

  // Committed: send. A failure here is not an error for the caller, the row stays pending.
  try {
    await dispatchIds(
      queued.map((event) => event.eventId),
      resolved,
    );
  } catch (error) {
    resolved.logger.warn('event dispatch deferred', { outcome: 'event_dispatch_deferred' }, error);
  }
  return result;
}

/** Emits one event in a transaction of its own (one-line `withTransaction`). */
export async function emitAfterCommit<N extends EventName>(
  db: Db | UserDatabase,
  name: N,
  data: EventInput<N>,
  opts?: { id?: string },
  deps: Partial<EmitDeps> = {},
): Promise<void> {
  await withTransaction(
    db,
    (_tx, outbox) => {
      outbox.add(name, data, opts);
      return Promise.resolve();
    },
    deps,
  );
}
