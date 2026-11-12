// Transactional event outbox and SDD demonstration run (SPEC-203 ET-2, ET-7; ADR-0122).
//
// Both tables are reserved to the service role: Row Level Security is enabled in the custom
// migration `events_rules` and no policy is granted to `authenticated`. Events enter the outbox
// through the `security definer` function `enqueue_event`, inside the business transaction.
import { sql } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
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
    attempts: smallint('attempts').notNull().default(0),
    lastError: text('last_error'),
    failed: boolean('failed').notNull().default(false),
  },
  (table) => [
    // The hourly tick and the dispatcher only read what is still to send.
    index('event_outbox_pending')
      .on(table.createdAt)
      .where(sql`${table.sentAt} is null and not ${table.failed}`),
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
export type SddDemoRun = typeof sddDemoRuns.$inferSelect;
