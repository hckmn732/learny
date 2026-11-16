// RLS isolation of the offline synchronisation receipts (SPEC-801 ET-6): an authenticated learner
// only sees, inserts, updates and deletes its own receipts; another learner sees none. The test
// also asserts the policy exists in `pg_policies`.
import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import { closeDb, serviceDb } from '../../src/client';
import { asUser, createTestUser, withRollback } from '../../src/testing';

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-801] RLS des reçus de synchronisation', () => {
  it('déclare la politique propriétaire (ET-6)', async () => {
    const rows = await serviceDb().execute<{ policyname: string }>(sql`
      select policyname from pg_policies
      where schemaname = 'public' and tablename = 'offline_sync_receipts'
    `);
    expect(rows.map((row) => row.policyname)).toContain('offline_sync_receipts_owner_all');
  });

  it('isole les reçus entre apprenants (CA-7)', async () => {
    await withRollback(async (tx) => {
      const owner = await createTestUser(tx, { email: 'rls-801-owner@test.learny.test' });
      const other = await createTestUser(tx, { email: 'rls-801-other@test.learny.test' });
      const clientId = '11111111-1111-4111-8111-111111111111';
      await tx.execute(sql`
        insert into public.offline_sync_receipts (user_id, client_id, status)
        values (${owner.id}::uuid, ${clientId}::uuid, 'applied')
      `);

      const seenByOwner = await asUser(tx, owner.id, (inner) =>
        inner.execute<{ client_id: string }>(sql`
          select client_id::text as client_id from public.offline_sync_receipts
        `),
      );
      expect(seenByOwner).toHaveLength(1);

      const seenByOther = await asUser(tx, other.id, (inner) =>
        inner.execute<{ client_id: string }>(sql`
          select client_id::text as client_id from public.offline_sync_receipts
        `),
      );
      expect(seenByOther).toHaveLength(0);

      const foreignInsert = await asUser(tx, other.id, (inner) =>
        inner.execute(sql`
          insert into public.offline_sync_receipts (user_id, client_id, status)
          values (${owner.id}::uuid, '22222222-2222-4222-8222-222222222222'::uuid, 'applied')
        `),
      ).catch((error: unknown) => error);
      expect(foreignInsert).toBeInstanceOf(Error);
    });
  });
});
