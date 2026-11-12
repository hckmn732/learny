// Helpers of the SPEC-203 integration suites: committed users (the jobs read them through other
// connections, so a rolled-back transaction would not do) and their cleanup.
import { randomUUID } from 'node:crypto';

import { serviceDb, sql, type schema } from '@learny/db';
import { createTestUser } from '@learny/db/testing';

export const FACTORY_PREFIX = 'sdd-203-';

export interface FactoryUserOptions {
  label: string;
  timezone: string;
  onboardingStep?: (typeof schema.profiles.$inferSelect)['onboardingStep'];
  /** Deletion already due at the given instant (ISO). */
  deletionScheduledFor?: string;
}

/** Inserts a user whose e-mail starts with the factory prefix, and commits it. */
export async function createFactoryUser(options: FactoryUserOptions): Promise<string> {
  const email = `${FACTORY_PREFIX}${options.label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const db = serviceDb();
  const id = await db.transaction(
    async (tx) => (await createTestUser(tx, { email, timezone: options.timezone })).id,
  );
  await db.execute(sql`
    update public.profiles
    set onboarding_step = ${options.onboardingStep ?? 'done'}::onboarding_step,
        deletion_requested_at = ${options.deletionScheduledFor === undefined ? null : sql`${options.deletionScheduledFor}::timestamptz - interval '30 days'`},
        deletion_scheduled_for = ${options.deletionScheduledFor ?? null}::timestamptz
    where id = ${id}::uuid
  `);
  return id;
}

/** Deletes every user created with the factory prefix (cascades to profiles and settings). */
export async function deleteFactoryUsers(): Promise<void> {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${FACTORY_PREFIX}%@test.learny.test`}`,
  );
}
