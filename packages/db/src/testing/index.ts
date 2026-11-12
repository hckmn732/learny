// Integration-test harness of @learny/db (`@learny/db/testing`, SPEC-101 ET-7).
//
// Every integration test runs in `withRollback`: all writes are discarded, so suites stay
// independent without truncating shared tables. `createTestUser` inserts directly into
// `auth.users`; from SPEC-102 the sign-up trigger creates the profile in the same transaction.
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomBytes } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '@learny/core';

import { buildUserClaims, serviceDb, type DbTx } from '../client';

const UUID = z.uuid();
const rollbackContext = new AsyncLocalStorage<true>();
let savepointCounter = 0;

class RollbackSignal extends Error {
  override readonly name = 'RollbackSignal';
}

/**
 * Runs `fn` in a service transaction that is always rolled back. The result of `fn` is returned.
 * Nesting is refused because an inner rollback would silently cancel the outer expectations (CL-3).
 */
export async function withRollback<T>(fn: (tx: DbTx) => Promise<T>): Promise<T> {
  if (rollbackContext.getStore() === true) {
    throw new Error('withRollback ne peut pas être imbriqué');
  }
  return rollbackContext.run(true, async () => {
    let result!: T;
    const signal = new RollbackSignal('rollback');
    try {
      await serviceDb().transaction(async (tx) => {
        result = await fn(tx);
        throw signal;
      });
    } catch (error) {
      if (error !== signal) throw error;
    }
    return result;
  });
}

export interface TestUserOptions {
  email?: string;
  firstName?: string;
  lastName?: string;
  timezone?: string;
  /** Raw `raw_user_meta_data` entries, merged over the named options (SPEC-102 EF-2, CL-1). */
  meta?: Record<string, unknown>;
}

export interface TestUser {
  id: string;
  email: string;
}

/** Inserts an `auth.users` row directly, with a unique e-mail, inside the given transaction. */
export async function createTestUser(tx: DbTx, options: TestUserOptions = {}): Promise<TestUser> {
  const email = options.email ?? `user-${randomBytes(4).toString('hex')}@test.learny.test`;
  const metadata = {
    first_name: options.firstName ?? null,
    last_name: options.lastName ?? null,
    timezone: options.timezone ?? null,
    ...(options.meta ?? {}),
  };
  const appMetadata = { provider: 'email', providers: ['email'] };
  const rows = await tx.execute<{ id: string; email: string }>(sql`
    insert into auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      raw_user_meta_data,
      raw_app_meta_data,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      ${email},
      ${JSON.stringify(metadata)}::jsonb,
      ${JSON.stringify(appMetadata)}::jsonb,
      now(),
      now()
    )
    returning id::text as id, email
  `);
  const row = rows[0];
  if (row === undefined) throw new Error('createTestUser : aucune ligne insérée.');
  return { id: row.id, email: row.email };
}

async function safeExecute(tx: DbTx, statement: ReturnType<typeof sql.raw>): Promise<void> {
  try {
    await tx.execute(statement);
  } catch {
    // Restoring the role is best effort: the original error is more useful to the caller.
  }
}

/** Runs `fn` under `authenticated` inside a savepoint, then restores the owner role (ET-7). */
export async function asUser<T>(
  tx: DbTx,
  userId: string,
  fn: (tx: DbTx) => Promise<T>,
): Promise<T> {
  if (!UUID.safeParse(userId).success) {
    throw new AppError('FORBIDDEN', 'Identifiant utilisateur invalide.');
  }
  savepointCounter += 1;
  const name = `as_user_${String(savepointCounter)}`;
  const claims = buildUserClaims({ userId });
  await tx.execute(sql.raw(`savepoint ${name}`));
  try {
    await tx.execute(
      sql`select set_config('request.jwt.claims', ${claims}, true), set_config('request.jwt.claim.sub', ${userId}, true)`,
    );
    await tx.execute(sql.raw('set local role authenticated'));
    const result = await fn(tx);
    await tx.execute(sql.raw('reset role'));
    await tx.execute(sql.raw(`release savepoint ${name}`));
    return result;
  } catch (error) {
    await safeExecute(tx, sql.raw('reset role'));
    await safeExecute(tx, sql.raw(`rollback to savepoint ${name}`));
    await safeExecute(tx, sql.raw(`release savepoint ${name}`));
    throw error;
  }
}

/** Restores the owner role inside the current transaction (e.g. after an `asUser` block). */
export async function asService<T>(tx: DbTx, fn: (tx: DbTx) => Promise<T>): Promise<T> {
  await tx.execute(sql.raw('reset role'));
  return fn(tx);
}

/**
 * Reserved hook for identifiers backed by sequences. Learny uses UUID primary keys everywhere
 * (data-model conventions), so there is currently nothing to reset.
 */
export function resetSequenceFreeIds(): Promise<void> {
  return Promise.resolve();
}

export * from './programme';
export * from './embedding';
