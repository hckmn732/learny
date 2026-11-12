// User factory (SPEC-115 EF-6). Inserts a real `auth.users` row with a reserved test address;
// the SPEC-102 trigger creates the profile and the default settings in the same transaction.
import { sql, type DbTx } from '@learny/db';
import { createTestUser } from '@learny/db/testing';

import { insert, uniqueEmail } from './helpers';

export interface UserFactoryOverrides {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  timezone?: string;
}

export interface FactoryUser extends Record<string, unknown> {
  id: string;
  email: string;
}

export async function createUser(
  tx: DbTx,
  overrides: UserFactoryOverrides = {},
): Promise<FactoryUser> {
  const email = overrides.email ?? uniqueEmail('factory-user');
  if (overrides.id === undefined) {
    const created = await createTestUser(tx, {
      email,
      ...(overrides.firstName === undefined ? {} : { firstName: overrides.firstName }),
      ...(overrides.lastName === undefined ? {} : { lastName: overrides.lastName }),
      ...(overrides.timezone === undefined ? {} : { timezone: overrides.timezone }),
    });
    return { id: created.id, email: created.email };
  }

  const rows = await insert<FactoryUser>(
    tx,
    'user',
    sql`
      insert into auth.users (
        id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data,
        email_confirmed_at, created_at, updated_at
      )
      values (
        ${overrides.id}::uuid,
        '00000000-0000-0000-0000-000000000000',
        'authenticated',
        'authenticated',
        ${email},
        ${JSON.stringify({
          first_name: overrides.firstName ?? null,
          last_name: overrides.lastName ?? null,
          timezone: overrides.timezone ?? 'Europe/Paris',
        })}::jsonb,
        '{"provider":"email","providers":["email"]}'::jsonb,
        now(),
        now(),
        now()
      )
      returning id::text as id, email
    `,
  );
  const row = rows[0];
  if (row === undefined) throw new Error('Fabrique user : aucune ligne insérée.');
  return row;
}
