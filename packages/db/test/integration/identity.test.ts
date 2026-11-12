// Integration tests of the identity schema (SPEC-102 §12): sign-up trigger, defaults, constraints,
// RLS and cascade. Every test runs against the local Supabase database (docs/engineering/testing.md §3).
import { randomBytes } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { afterAll, describe, expect, it } from 'vitest';

import {
  ACCOUNT_RULES,
  AUTOMATION_DEFAULTS,
  AUTOMATION_KEYS,
  NOTIFICATION_DEFAULTS,
  STUDY_DEFAULTS,
} from '@learny/config';

import { closeDb, serviceDb, type DbTx } from '../../src/client';
import { asUser, createTestUser, withRollback } from '../../src/testing';

interface Row {
  [key: string]: unknown;
}

type Queryable = Pick<DbTx, 'execute'>;

const TABLES = [
  'profiles',
  'study_preferences',
  'notification_settings',
  'push_subscriptions',
  'automation_settings',
  'pauses',
] as const;

const KEY_COLUMN: Record<(typeof TABLES)[number], string> = {
  profiles: 'id',
  study_preferences: 'user_id',
  notification_settings: 'user_id',
  push_subscriptions: 'user_id',
  automation_settings: 'user_id',
  pauses: 'user_id',
};

let savepoint = 0;

/** SQLSTATE of a Drizzle/driver error (Drizzle 0.44 wraps driver errors in `cause`). */
function errorCode(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current !== null && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return 'unknown';
}

/** Runs a statement that must fail, then restores the transaction to its savepoint. */
async function sqlState(tx: DbTx, run: () => Promise<unknown>): Promise<string> {
  savepoint += 1;
  const name = `spec102_${String(savepoint)}`;
  await tx.execute(sql.raw(`savepoint ${name}`));
  try {
    await run();
    await tx.execute(sql.raw(`release savepoint ${name}`));
    return '00000';
  } catch (error) {
    await tx.execute(sql.raw(`rollback to savepoint ${name}`));
    await tx.execute(sql.raw(`release savepoint ${name}`));
    return errorCode(error);
  }
}

async function count(
  tx: Queryable,
  table: (typeof TABLES)[number],
  userId: string,
): Promise<number> {
  const rows = await tx.execute<{ count: number }>(
    sql`select count(*)::int as count from ${sql.raw(`public.${table}`)} where ${sql.raw(KEY_COLUMN[table])} = ${userId}::uuid`,
  );
  return rows[0]?.count ?? -1;
}

async function allCounts(tx: Queryable, userId: string): Promise<Record<string, number>> {
  const entries = await Promise.all(
    TABLES.map(async (table) => [table, await count(tx, table, userId)] as const),
  );
  return Object.fromEntries(entries);
}

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-102] identité et préférences', () => {
  it('creates exactly one profile, rhythm, notification and ten automations (CA-1)', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);

      expect(await allCounts(tx, user.id)).toEqual({
        profiles: 1,
        study_preferences: 1,
        notification_settings: 1,
        push_subscriptions: 0,
        automation_settings: 10,
        pauses: 0,
      });

      const automations = await tx.execute<{ key: string; enabled: boolean; params: Row }>(sql`
        select key::text as key, enabled, params
        from public.automation_settings
        where user_id = ${user.id}::uuid
        order by key
      `);
      expect(automations).toHaveLength(10);
      expect(automations.map((row) => row.key)).toEqual([...AUTOMATION_KEYS].sort());
      for (const row of automations) {
        expect(row.enabled).toBe(true);
        expect(row.params).toEqual(
          AUTOMATION_DEFAULTS[row.key as keyof typeof AUTOMATION_DEFAULTS],
        );
      }
    });
  });

  it('applies the BR-ACC-08 and BR-NOT-04 defaults field by field (CA-2)', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);

      const [profile] = await tx.execute<Row>(sql`
        select email, course_language, tutor_tone, timezone, onboarding_step,
               onboarding_completed_at, terms_version, terms_accepted_at,
               current_formation_id, deletion_requested_at, deletion_scheduled_for,
               sidebar_collapsed, streak_days, streak_computed_on
        from public.profiles where id = ${user.id}::uuid
      `);
      expect(profile).toEqual({
        email: user.email,
        course_language: ACCOUNT_RULES.defaultCourseLanguage,
        tutor_tone: ACCOUNT_RULES.defaultTone,
        timezone: ACCOUNT_RULES.defaultTimeZone,
        onboarding_step: 'profil',
        onboarding_completed_at: null,
        terms_version: null,
        terms_accepted_at: null,
        current_formation_id: null,
        deletion_requested_at: null,
        deletion_scheduled_for: null,
        sidebar_collapsed: false,
        streak_days: 0,
        streak_computed_on: null,
      });

      const [study] = await tx.execute<Row>(sql`
        select hours_per_day, study_days, preferred_slots
        from public.study_preferences where user_id = ${user.id}::uuid
      `);
      expect(study).toEqual({
        hours_per_day: STUDY_DEFAULTS.hoursPerDay,
        study_days: [...STUDY_DEFAULTS.studyDays],
        preferred_slots: [...STUDY_DEFAULTS.preferredSlots],
      });

      const [notification] = await tx.execute<Row>(sql`
        select channel_email, channel_push, type_revision, type_validation, type_course,
               type_gap, type_planning, type_relaunch, digest_time, quiet_start, quiet_end,
               weekend_quiet, max_per_day
        from public.notification_settings where user_id = ${user.id}::uuid
      `);
      const normalized = {
        ...notification,
        digest_time: String(notification?.digest_time).slice(0, 5),
        quiet_start: String(notification?.quiet_start).slice(0, 5),
        quiet_end: String(notification?.quiet_end).slice(0, 5),
      };
      expect(normalized).toEqual({
        channel_email: NOTIFICATION_DEFAULTS.channelEmail,
        channel_push: NOTIFICATION_DEFAULTS.channelPush,
        type_revision: NOTIFICATION_DEFAULTS.types.revision,
        type_validation: NOTIFICATION_DEFAULTS.types.validation,
        type_course: NOTIFICATION_DEFAULTS.types.course,
        type_gap: NOTIFICATION_DEFAULTS.types.gap,
        type_planning: NOTIFICATION_DEFAULTS.types.planning,
        type_relaunch: NOTIFICATION_DEFAULTS.types.relaunch,
        digest_time: NOTIFICATION_DEFAULTS.digestTime,
        quiet_start: NOTIFICATION_DEFAULTS.quietStart,
        quiet_end: NOTIFICATION_DEFAULTS.quietEnd,
        weekend_quiet: NOTIFICATION_DEFAULTS.weekendQuiet,
        max_per_day: NOTIFICATION_DEFAULTS.maxPerDay,
      });
    });
  });

  it('copies valid sign-up metadata and falls back to defaults (CA-4, EF-2, CL-1)', async () => {
    await withRollback(async (tx) => {
      const valid = await createTestUser(tx, {
        meta: {
          first_name: 'Alex',
          last_name: 'Perrin',
          timezone: 'America/New_York',
          course_language: 'en',
        },
      });
      const [copied] = await tx.execute<Row>(sql`
        select first_name, last_name, timezone, course_language
        from public.profiles where id = ${valid.id}::uuid
      `);
      expect(copied).toEqual({
        first_name: 'Alex',
        last_name: 'Perrin',
        timezone: 'America/New_York',
        course_language: 'en',
      });

      const invalid = await createTestUser(tx, {
        meta: {
          first_name: 'x'.repeat(70),
          last_name: '',
          timezone: 'Mars/Olympus',
          course_language: 'xx',
        },
      });
      const [fallback] = await tx.execute<Row>(sql`
        select first_name, last_name, timezone, course_language
        from public.profiles where id = ${invalid.id}::uuid
      `);
      expect(fallback).toEqual({
        first_name: 'x'.repeat(60),
        last_name: null,
        timezone: 'Europe/Paris',
        course_language: 'fr',
      });

      const absent = await createTestUser(tx);
      const [defaults] = await tx.execute<Row>(sql`
        select first_name, last_name, timezone, course_language
        from public.profiles where id = ${absent.id}::uuid
      `);
      expect(defaults).toEqual({
        first_name: null,
        last_name: null,
        timezone: 'Europe/Paris',
        course_language: 'fr',
      });
    });
  });

  it('refuses invalid time zones, rhythm, cap, pauses and e-mail changes (CA-3, CL-2..CL-6)', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const userId = user.id;

      expect(
        await sqlState(tx, () =>
          tx.execute(
            sql`update public.profiles set timezone = 'Mars/Olympus' where id = ${userId}::uuid`,
          ),
        ),
        'CL-2 timezone invalide',
      ).toBe('22023');

      for (const days of ['{}', '{0}', '{1,1}', '{8}']) {
        expect(
          await sqlState(tx, () =>
            tx.execute(
              sql`update public.study_preferences set study_days = ${days}::smallint[] where user_id = ${userId}::uuid`,
            ),
          ),
          `CL-3 study_days ${days}`,
        ).toBe('23514');
      }
      for (const hours of [0, 7]) {
        expect(
          await sqlState(tx, () =>
            tx.execute(
              sql`update public.study_preferences set hours_per_day = ${hours} where user_id = ${userId}::uuid`,
            ),
          ),
          `CL-3 hours_per_day ${String(hours)}`,
        ).toBe('23514');
      }
      expect(
        await sqlState(tx, () =>
          tx.execute(
            sql`update public.study_preferences set preferred_slots = '{}'::study_slot[] where user_id = ${userId}::uuid`,
          ),
        ),
        'CL-3 preferred_slots vide',
      ).toBe('23514');

      expect(
        await sqlState(tx, () =>
          tx.execute(
            sql`update public.notification_settings set max_per_day = 4 where user_id = ${userId}::uuid`,
          ),
        ),
        'CL-4 plafond 4',
      ).toBe('23514');

      await tx.execute(sql`
        insert into public.pauses (user_id, starts_on, ends_on)
        values (${userId}::uuid, '2026-11-12', '2026-11-20')
      `);
      expect(
        await sqlState(tx, () =>
          tx.execute(sql`
            insert into public.pauses (user_id, starts_on, ends_on)
            values (${userId}::uuid, '2026-11-21', '2026-11-25')
          `),
        ),
        'CL-5 deuxième pause active',
      ).toBe('23505');

      expect(
        await sqlState(tx, () =>
          tx.execute(sql`
            insert into public.pauses (user_id, starts_on, ends_on)
            values (${userId}::uuid, '2026-12-10', '2026-12-01')
          `),
        ),
        'CL-6 fin avant début',
      ).toBe('23514');

      expect(
        await sqlState(tx, () =>
          tx.execute(sql`
            insert into public.pauses (user_id, starts_on, ends_on, status)
            values (${userId}::uuid, '2026-12-10', '2026-12-20', 'ended')
          `),
        ),
        'CL-6 pause terminée sans ended_at',
      ).toBe('23514');
    });
  });

  it('refuses an e-mail change from an authenticated client, accepts it from the service (CL-9)', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);

      // RLS has no policy before SPEC-113 (CA-7); these policies only live in the rolled-back
      // transaction so the UPDATE reaches the row and exercises the `validate_profile` trigger.
      await tx.execute(sql`
        create policy spec102_email_select on public.profiles
        for select to authenticated
        using (id = auth.uid())
      `);
      await tx.execute(sql`
        create policy spec102_email_update on public.profiles
        for update to authenticated
        using (id = auth.uid())
        with check (id = auth.uid())
      `);

      let refused: unknown;
      try {
        await asUser(tx, user.id, (inner) =>
          inner.execute(
            sql`update public.profiles set email = 'changed@test.learny.test' where id = ${user.id}::uuid`,
          ),
        );
      } catch (error) {
        refused = error;
      }
      expect(errorCode(refused), 'CL-9 e-mail immuable').toBe('42501');
      let message: unknown;
      let current: unknown = refused;
      for (
        let depth = 0;
        depth < 4 && current !== null && typeof current === 'object';
        depth += 1
      ) {
        const candidate = (current as { message?: unknown }).message;
        if (typeof candidate === 'string' && candidate === 'email_immutable') message = candidate;
        current = (current as { cause?: unknown }).cause;
      }
      expect(message).toBe('email_immutable');

      await tx.execute(sql`drop policy spec102_email_update on public.profiles`);
      await tx.execute(sql`drop policy spec102_email_select on public.profiles`);

      await tx.execute(sql`
        update public.profiles set email = 'service@test.learny.test' where id = ${user.id}::uuid
      `);
      const [profile] = await tx.execute<Row>(sql`
        select email from public.profiles where id = ${user.id}::uuid
      `);
      expect(profile?.email).toBe('service@test.learny.test');
    });
  });

  it('cascades the deletion of auth.users to the six tables (CA-5, EF-4)', async () => {
    const email = `cascade-${randomBytes(4).toString('hex')}@test.learny.test`;
    const endpoint = `https://push.test.learny.test/${randomBytes(6).toString('hex')}`;
    const userId = await serviceDb().transaction(async (tx) => {
      const user = await createTestUser(tx, { email });
      await tx.execute(sql`
        insert into public.pauses (user_id, starts_on, ends_on)
        values (${user.id}::uuid, '2026-11-12', '2026-11-20')
      `);
      await tx.execute(sql`
        insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
        values (${user.id}::uuid, ${endpoint}, 'p256dh', 'auth')
      `);
      return user.id;
    });

    try {
      const before = await allCounts(serviceDb(), userId);
      expect(before).toEqual({
        profiles: 1,
        study_preferences: 1,
        notification_settings: 1,
        push_subscriptions: 1,
        automation_settings: 10,
        pauses: 1,
      });

      await serviceDb().execute(sql`delete from auth.users where id = ${userId}::uuid`);

      const after = await allCounts(serviceDb(), userId);
      expect(after).toEqual({
        profiles: 0,
        study_preferences: 0,
        notification_settings: 0,
        push_subscriptions: 0,
        automation_settings: 0,
        pauses: 0,
      });
    } finally {
      await serviceDb().execute(sql`delete from auth.users where id = ${userId}::uuid`);
    }
  });

  it('keeps the SQL and TypeScript automation defaults identical (CA-6)', async () => {
    const rows = await serviceDb().execute<{ key: string; params: Row }>(sql`
      select k::text as key, public.default_automation_params(k::text) as params
      from pg_catalog.unnest(pg_catalog.enum_range(null::public.automation_key)) as k
      order by k::text
    `);
    expect(rows).toHaveLength(AUTOMATION_KEYS.length);
    for (const row of rows) {
      expect(row.params, row.key).toEqual(
        AUTOMATION_DEFAULTS[row.key as keyof typeof AUTOMATION_DEFAULTS],
      );
    }
  });

  it('enables RLS on the six tables and limits each row to its owner (CA-7)', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const other = await createTestUser(tx);
      await tx.execute(sql`
        insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
        values (${user.id}::uuid, 'https://push.test.learny.test/spec102', 'p256dh', 'auth')
      `);
      await tx.execute(sql`
        insert into public.pauses (user_id, starts_on, ends_on)
        values (${user.id}::uuid, '2026-11-12', '2026-11-20')
      `);

      const tables = await tx.execute<Row>(sql`
        select c.relname as table, c.relrowsecurity as enabled
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public'
          and c.relname in ('profiles', 'study_preferences', 'notification_settings',
                            'push_subscriptions', 'automation_settings', 'pauses')
        order by c.relname
      `);
      expect(tables).toHaveLength(6);
      expect(tables.every((row) => row.enabled === true)).toBe(true);

      // SPEC-113 adds owner policies; this test keeps only its own six-table scope.
      const policies = await tx.execute<Row>(sql`
        select tablename, policyname from pg_policies
        where schemaname = 'public'
          and tablename in ('profiles', 'study_preferences', 'notification_settings',
                            'push_subscriptions', 'automation_settings', 'pauses')
        order by tablename, policyname
      `);
      expect(policies.map((row) => `${String(row.tablename)}.${String(row.policyname)}`)).toEqual([
        'automation_settings.automation_settings_owner_all',
        'notification_settings.notification_settings_owner_all',
        'pauses.pauses_owner_all',
        'profiles.profiles_owner_select',
        'profiles.profiles_owner_update',
        'push_subscriptions.push_subscriptions_owner_all',
        'study_preferences.study_preferences_owner_all',
      ]);

      for (const table of TABLES) {
        const column = KEY_COLUMN[table];
        const count = async (userId: string) =>
          asUser(tx, userId, async (inner) => {
            const result = await inner.execute<{ count: number }>(sql`
              select count(*)::int as count
              from ${sql.raw(`public.${table}`)}
              where ${sql.raw(column)} = ${user.id}::uuid
            `);
            return result[0]?.count ?? -1;
          });
        expect(await count(user.id), table).toBeGreaterThanOrEqual(1);
        expect(await count(other.id), table).toBe(0);
      }
    });
  });

  it('replays the sign-up logic without duplicating rows (CL-7)', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      await tx.execute(
        sql.raw(
          'create temporary table spec102_replay_users (id uuid, email text, raw_user_meta_data jsonb) on commit drop',
        ),
      );
      await tx.execute(
        sql.raw(
          'create trigger spec102_replay after insert on spec102_replay_users for each row execute function public.handle_new_user()',
        ),
      );
      await tx.execute(sql`
        insert into spec102_replay_users (id, email, raw_user_meta_data)
        values (${user.id}::uuid, ${user.email}, '{"first_name":"Rejeu"}'::jsonb)
      `);

      expect(await allCounts(tx, user.id)).toEqual({
        profiles: 1,
        study_preferences: 1,
        notification_settings: 1,
        push_subscriptions: 0,
        automation_settings: 10,
        pauses: 0,
      });
    });
  });

  it('refuses a duplicated push endpoint (CL-8)', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const endpoint = `https://push.test.learny.test/${randomBytes(6).toString('hex')}`;
      await tx.execute(sql`
        insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
        values (${user.id}::uuid, ${endpoint}, 'p256dh', 'auth')
      `);
      expect(
        await sqlState(tx, () =>
          tx.execute(sql`
            insert into public.push_subscriptions (user_id, endpoint, p256dh, auth)
            values (${user.id}::uuid, ${endpoint}, 'other', 'other')
          `),
        ),
        'CL-8 endpoint dupliqué',
      ).toBe('23505');
    });
  });

  it('maintains updated_at with set_updated_at (EF-5)', async () => {
    await withRollback(async (tx) => {
      const user = await createTestUser(tx);
      const forced = await tx.execute<Row>(sql`
        update public.profiles set updated_at = '2000-01-01' where id = ${user.id}::uuid
        returning updated_at
      `);
      expect(new Date(String(forced[0]?.updated_at)).getUTCFullYear()).toBeGreaterThan(2020);

      const updated = await tx.execute<Row>(sql`
        update public.profiles set first_name = 'Alex' where id = ${user.id}::uuid
        returning updated_at
      `);
      expect(new Date(String(updated[0]?.updated_at)).getUTCFullYear()).toBeGreaterThan(2020);
    });
  });
});
