// Offline synchronisation receipts (SPEC-801 ET-6, ADR-0200). One row per `clientId` received by
// `POST /api/v1/sync/offline-answers`: the composite primary key makes a replay a `duplicate`
// without any double revision or double `daily_activity` increment (CL-2). Receipts older than
// 30 days are purged by the nightly cron (SPEC-203).
import { sql } from 'drizzle-orm';
import { check, index, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { answers } from './bricks-activities';
import { profiles } from './identity';

export const OFFLINE_SYNC_STATUSES = ['applied', 'conflict', 'rejected'] as const;

export const offlineSyncReceipts = pgTable(
  'offline_sync_receipts',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => profiles.id, { onDelete: 'cascade' }),
    clientId: uuid('client_id').notNull(),
    status: text('status').notNull(),
    answerId: uuid('answer_id').references(() => answers.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ name: 'offline_sync_receipts_pkey', columns: [table.userId, table.clientId] }),
    index('offline_sync_receipts_created_at_idx').on(table.createdAt),
    check(
      'offline_sync_receipts_status_check',
      sql`${table.status} in ('applied', 'conflict', 'rejected')`,
    ),
  ],
);
