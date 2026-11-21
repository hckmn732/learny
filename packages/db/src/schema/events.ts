// Transactional event outbox, durable job deliveries and the SDD demonstration run
// (SPEC-203 ET-2, ET-7; SPEC-2102; ADR-0122, ADR-2006, ADR-2014).
//
// All three tables are reserved to the service role: Row Level Security is enabled in the custom
// migration `events_rules` (and `jobs_rules`) and no policy is granted to `authenticated`. Events
// enter the outbox through the `security definer` function `enqueue_event`, inside the business
// transaction. `dispatched_at` and `job_deliveries` belong to the Python worker: the TypeScript
// dispatcher keeps using `sent_at` and ignores them until the worker replaces Inngest.
import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { createdAt, id } from './columns';
import { profiles } from './identity';

/** ET-2 — an event is sent at most once the transaction commits; after this many tries it fails. */
export const OUTBOX_MAX_ATTEMPTS = 10;

/** ET-2 — one pending or sent domain event, deduplicated by its Inngest identifier. */
export const eventOutbox = pgTable(
  'event_outbox',
  {
    id: id(),
    /** Inngest deduplication identifier (24 h window), unique across the outbox. */
    eventId: text('event_id').notNull().unique(),
    name: text('name').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    userId: uuid('user_id').references(() => profiles.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    /** SPEC-2102: set once the Python dispatcher fanned the event out; ignored by TypeScript. */
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    attempts: smallint('attempts').notNull().default(0),
    lastError: text('last_error'),
    failed: boolean('failed').notNull().default(false),
  },
  (table) => [
    // The hourly tick and the dispatcher only read what is still to send.
    index('event_outbox_pending')
      .on(table.createdAt)
      .where(sql`${table.sentAt} is null and not ${table.failed}`),
    // SPEC-2102: the Python dispatcher only reads what it has not fanned out yet.
    index('event_outbox_undispatched')
      .on(table.createdAt)
      .where(sql`${table.dispatchedAt} is null`),
  ],
);

/** SPEC-2102 ET-1 — one durable delivery per (event, Python consumer), claimed under a lease. */
export const jobDeliveries = pgTable(
  'job_deliveries',
  {
    eventId: text('event_id')
      .notNull()
      .references(() => eventOutbox.eventId, { onDelete: 'cascade' }),
    /** Consumer name, `context.verb_object` (see `learny_worker.consumers`). */
    consumer: text('consumer').notNull(),
    status: text('status').notNull().default('pending'),
    attempts: smallint('attempts').notNull().default(0),
    runAfter: timestamp('run_after', { withTimezone: true }).notNull(),
    lockedUntil: timestamp('locked_until', { withTimezone: true }),
    lastError: text('last_error'),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.consumer] }),
    index('job_deliveries_ready')
      .on(table.runAfter)
      .where(sql`${table.status} in ('pending', 'running')`),
    check('job_deliveries_consumer_check', sql`${table.consumer} ~ '^[a-z]+(\.[a-z0-9_]+)+$'`),
    check(
      'job_deliveries_status_check',
      sql`${table.status} in ('pending', 'running', 'done', 'failed')`,
    ),
  ],
);

/** ET-7 — one run of the demonstration pipeline (`sdd-demo-pipeline`). */
export const sddDemoRuns = pgTable('sdd_demo_runs', {
  runId: uuid('run_id').primaryKey(),
  steps: jsonb('steps').$type<{ name: string; at: string }[]>().notNull().default([]),
  attempts: integer('attempts').notNull().default(0),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export type EventOutboxRow = typeof eventOutbox.$inferSelect;
export type NewEventOutboxRow = typeof eventOutbox.$inferInsert;
export type JobDeliveryRow = typeof jobDeliveries.$inferSelect;
export type SddDemoRun = typeof sddDemoRuns.$inferSelect;
