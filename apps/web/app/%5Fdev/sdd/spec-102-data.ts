// Owner-role reads of the SPEC-102 demonstration, kept under `_dev` so the ESLint boundary of
// SPEC-101 ET-6 stays the only place allowed to use `serviceDb` in the web app (ADR-0049).
import { clock } from '@learny/core';
import { serviceDb, sql, type DbTx } from '@learny/db';
import { createTestUser, withRollback } from '@learny/db/testing';

/** Demo accounts are recognisable and never created by the product itself. */
export const DEMO_EMAIL_PATTERN = 'spec102-%@test.learny.test';

export function demoEmail(): string {
  const stamp = clock.now().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  return `spec102-${stamp}@test.learny.test`;
}

export interface Spec102Profile {
  email: string;
  courseLanguage: string;
  tutorTone: string;
  timezone: string;
  onboardingStep: string;
}

export interface Spec102Study {
  hoursPerDay: number;
  studyDays: number[];
  preferredSlots: string[];
}

export interface Spec102Notifications {
  channelEmail: boolean;
  channelPush: boolean;
  types: Record<string, boolean>;
  digestTime: string;
  quietStart: string;
  quietEnd: string;
  weekendQuiet: boolean;
  maxPerDay: number;
}

export interface Spec102Automation {
  key: string;
  enabled: boolean;
  params: Record<string, unknown>;
}

export type ConstraintKey = 'cl2' | 'cl3' | 'cl4' | 'cl5';

export interface Spec102Constraint {
  key: ConstraintKey;
  expected: string;
  sqlstate: string;
  ok: boolean;
}

export interface Spec102Data {
  email: string;
  profile: Spec102Profile;
  study: Spec102Study;
  notifications: Spec102Notifications;
  automations: Spec102Automation[];
  constraints: Spec102Constraint[];
}

interface Row {
  [key: string]: unknown;
}

let savepoint = 0;

function errorCode(error: unknown): string {
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current !== null && typeof current === 'object'; depth += 1) {
    const code = (current as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return 'unknown';
}

async function sqlState(tx: DbTx, run: () => Promise<unknown>): Promise<string> {
  savepoint += 1;
  const name = `spec102_demo_${String(savepoint)}`;
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

function time(value: unknown): string {
  return typeof value === 'string' ? value.slice(0, 5) : '';
}

async function constraints(): Promise<Spec102Constraint[]> {
  return withRollback(async (tx) => {
    const user = await createTestUser(tx);
    const userId = user.id;

    const cl2 = await sqlState(tx, () =>
      tx.execute(
        sql`update public.profiles set timezone = 'Mars/Olympus' where id = ${userId}::uuid`,
      ),
    );
    const cl3 = await sqlState(tx, () =>
      tx.execute(
        sql`update public.study_preferences set study_days = '{1,1}'::smallint[] where user_id = ${userId}::uuid`,
      ),
    );
    const cl4 = await sqlState(tx, () =>
      tx.execute(
        sql`update public.notification_settings set max_per_day = 4 where user_id = ${userId}::uuid`,
      ),
    );
    await tx.execute(sql`
      insert into public.pauses (user_id, starts_on, ends_on)
      values (${userId}::uuid, '2026-11-12', '2026-11-20')
    `);
    const cl5 = await sqlState(tx, () =>
      tx.execute(sql`
        insert into public.pauses (user_id, starts_on, ends_on)
        values (${userId}::uuid, '2026-11-21', '2026-11-25')
      `),
    );

    const cases: [ConstraintKey, string, string][] = [
      ['cl2', '22023', cl2],
      ['cl3', '23514', cl3],
      ['cl4', '23514', cl4],
      ['cl5', '23505', cl5],
    ];
    return cases.map(([key, expected, sqlstate]) => ({
      key,
      expected,
      sqlstate,
      ok: sqlstate === expected,
    }));
  });
}

/** Finds the most recent demo account created by this page (id + e-mail). */
export async function findDemoUser(): Promise<{ id: string; email: string } | null> {
  const rows = await serviceDb().execute<{ id: string; email: string }>(sql`
    select id::text as id, email
    from auth.users
    where email like ${DEMO_EMAIL_PATTERN}
    order by created_at desc
    limit 1
  `);
  return rows[0] ?? null;
}

/** Creates the demo account once; the sign-up trigger builds every dependent row (EF-1). */
export async function ensureDemoUser(): Promise<void> {
  const existing = await findDemoUser();
  if (existing !== null) return;
  const metadata = {
    first_name: 'Alex',
    last_name: 'Perrin',
    timezone: 'Europe/Paris',
    course_language: 'fr',
  };
  const appMetadata = { provider: 'email', providers: ['email'] };
  await serviceDb().execute(sql`
    insert into auth.users (
      id, instance_id, aud, role, email, email_confirmed_at,
      raw_user_meta_data, raw_app_meta_data, created_at, updated_at
    )
    values (
      gen_random_uuid(),
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      ${demoEmail()},
      now(),
      ${JSON.stringify(metadata)}::jsonb,
      ${JSON.stringify(appMetadata)}::jsonb,
      now(),
      now()
    )
  `);
}

/** Deletes every demo account of this page; the cascade removes the six table rows (EF-4). */
export async function removeDemoUser(): Promise<void> {
  await serviceDb().execute(sql`delete from auth.users where email like ${DEMO_EMAIL_PATTERN}`);
}

/** Full demonstration payload, or `null` while no demo account exists. */
export async function loadSpec102Demo(): Promise<Spec102Data | null> {
  const user = await findDemoUser();
  if (user === null) return null;

  const [profiles] = await serviceDb().execute<Row>(sql`
    select email, course_language, tutor_tone, timezone, onboarding_step
    from public.profiles where id = ${user.id}::uuid
  `);
  const [study] = await serviceDb().execute<Row>(sql`
    select hours_per_day, study_days, preferred_slots
    from public.study_preferences where user_id = ${user.id}::uuid
  `);
  const [notification] = await serviceDb().execute<Row>(sql`
    select channel_email, channel_push, type_revision, type_validation, type_course,
           type_gap, type_planning, type_relaunch, digest_time, quiet_start, quiet_end,
           weekend_quiet, max_per_day
    from public.notification_settings where user_id = ${user.id}::uuid
  `);
  const automations = await serviceDb().execute<Row>(sql`
    select key::text as key, enabled, params
    from public.automation_settings
    where user_id = ${user.id}::uuid
    order by key
  `);

  if (profiles === undefined || study === undefined || notification === undefined) return null;

  return {
    email: user.email,
    profile: {
      email: String(profiles.email),
      courseLanguage: String(profiles.course_language),
      tutorTone: String(profiles.tutor_tone),
      timezone: String(profiles.timezone),
      onboardingStep: String(profiles.onboarding_step),
    },
    study: {
      hoursPerDay: Number(study.hours_per_day),
      studyDays: (study.study_days as number[] | null) ?? [],
      preferredSlots: (study.preferred_slots as string[] | null) ?? [],
    },
    notifications: {
      channelEmail: notification.channel_email === true,
      channelPush: notification.channel_push === true,
      types: {
        revision: notification.type_revision === true,
        validation: notification.type_validation === true,
        course: notification.type_course === true,
        gap: notification.type_gap === true,
        planning: notification.type_planning === true,
        relaunch: notification.type_relaunch === true,
      },
      digestTime: time(notification.digest_time),
      quietStart: time(notification.quiet_start),
      quietEnd: time(notification.quiet_end),
      weekendQuiet: notification.weekend_quiet === true,
      maxPerDay: Number(notification.max_per_day),
    },
    automations: automations.map((row) => ({
      key: String(row.key),
      enabled: row.enabled === true,
      params: (row.params as Record<string, unknown> | null) ?? {},
    })),
    constraints: await constraints(),
  };
}
