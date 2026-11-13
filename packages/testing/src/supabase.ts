// Real Supabase sessions for integration and end-to-end tests (SPEC-201 §12). A user is created
// with the Auth admin API, signs in with a password, and the cookies written by @supabase/ssr are
// captured: they are exactly what a browser sends to the application.
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';

export interface SupabaseLocalEnv {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
  /** Server-side JWT secret of the local stack (SPEC-206: Storage tokens); never sent to a browser. */
  jwtSecret: string;
}

let cached: SupabaseLocalEnv | undefined;

function parseEnvOutput(output: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const line of output.split('\n')) {
    const match = /^([A-Z0-9_]+)="?(.*?)"?$/.exec(line.trim());
    if (match?.[1] !== undefined && match[2] !== undefined) values[match[1]] = match[2];
  }
  return values;
}

/** Keys of the local Supabase stack: from the environment, else from `supabase status`. */
export function supabaseLocalEnv(
  env: Record<string, string | undefined> = process.env,
): SupabaseLocalEnv {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const jwtSecret = env.SUPABASE_JWT_SECRET;
  if (url && anonKey && serviceRoleKey && jwtSecret) {
    return { url, anonKey, serviceRoleKey, jwtSecret };
  }
  if (cached !== undefined) return cached;
  let output: string;
  try {
    output = execFileSync('supabase', ['status', '-o', 'env'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    throw new Error('Supabase local injoignable : lancer pnpm dev:up');
  }
  const values = parseEnvOutput(output);
  const resolved = {
    url: url ?? values.API_URL ?? 'http://127.0.0.1:54321',
    anonKey: anonKey ?? values.ANON_KEY ?? '',
    serviceRoleKey: serviceRoleKey ?? values.SERVICE_ROLE_KEY ?? '',
    jwtSecret: jwtSecret ?? values.JWT_SECRET ?? '',
  };
  if (resolved.anonKey === '' || resolved.serviceRoleKey === '' || resolved.jwtSecret === '') {
    throw new Error('Clés Supabase locales introuvables : lancer pnpm dev:up');
  }
  cached = resolved;
  return resolved;
}

export interface TestSession {
  userId: string;
  email: string;
  cookies: { name: string; value: string }[];
  /** Value of the `Cookie` request header. */
  cookieHeader: string;
}

export interface TestSessionOptions {
  email?: string;
  /** Default true. `false` clears `email_confirmed_at` after sign-in (403 EMAIL_NOT_CONFIRMED). */
  confirmed?: boolean;
}

export async function createTestSession(options: TestSessionOptions = {}): Promise<TestSession> {
  const { url, anonKey, serviceRoleKey } = supabaseLocalEnv();
  const email = options.email ?? `session-${randomBytes(4).toString('hex')}@test.learny.test`;
  const password = `pw-${randomBytes(12).toString('hex')}`;
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error !== null) throw new Error(`createUser : ${created.error.message}`);

  const jar = new Map<string, string>();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (items) => {
        for (const item of items) jar.set(item.name, item.value);
      },
    },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error !== null) throw new Error(`signIn : ${signedIn.error.message}`);

  if (options.confirmed === false) {
    // Imported lazily: only this branch needs the database.
    const { serviceDb, sql } = await import('@learny/db');
    await serviceDb().execute(
      sql`update auth.users set email_confirmed_at = null where id = ${created.data.user.id}::uuid`,
    );
  }

  const cookies = [...jar].map(([name, value]) => ({ name, value }));
  return {
    userId: created.data.user.id,
    email,
    cookies,
    cookieHeader: cookies.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join('; '),
  };
}

/**
 * Signs in a seeded demonstration user. The SPEC-115 seed inserts `auth.users` directly, so the
 * e-mail identity is completed here and a random password is set before the password grant.
 */
export async function createDemoSession(userId: string, email: string): Promise<TestSession> {
  const { url, anonKey, serviceRoleKey } = supabaseLocalEnv();
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const password = `pw-${randomBytes(12).toString('hex')}`;
  const { serviceDb, sql } = await import('@learny/db');
  await serviceDb().execute(sql`
    insert into auth.identities (id, user_id, provider, provider_id, identity_data, created_at, updated_at)
    values (
      gen_random_uuid(), ${userId}::uuid, 'email', ${userId},
      jsonb_build_object('sub', ${userId}, 'email', ${email}, 'email_verified', true),
      now(), now()
    )
    on conflict (provider_id, provider) do nothing
  `);
  const updated = await admin.auth.admin.updateUserById(userId, { password });
  if (updated.error !== null) throw new Error(`updateUserById : ${updated.error.message}`);
  const jar = new Map<string, string>();
  const client = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => [...jar].map(([name, value]) => ({ name, value })),
      setAll: (items) => {
        for (const item of items) jar.set(item.name, item.value);
      },
    },
  });
  const signedIn = await client.auth.signInWithPassword({ email, password });
  if (signedIn.error !== null) throw new Error(`signIn : ${signedIn.error.message}`);
  const cookies = [...jar].map(([name, value]) => ({ name, value }));
  return {
    userId,
    email,
    cookies,
    cookieHeader: cookies.map((c) => `${c.name}=${encodeURIComponent(c.value)}`).join('; '),
  };
}

/** Deletes a session user created by `createTestSession` (cascades to its rows). */
export async function deleteTestSession(session: Pick<TestSession, 'userId'>): Promise<void> {
  const { url, serviceRoleKey } = supabaseLocalEnv();
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  await admin.auth.admin.deleteUser(session.userId);
}

export interface ProfileUserOptions {
  email: string;
  /** IANA zone stored in the profile (read from the sign-up metadata by the SPEC-102 trigger). */
  timezone?: string;
  /** Onboarding step of the profile, `done` by default. */
  onboardingStep?: 'profil' | 'rythme' | 'ia' | 'rappels' | 'depart' | 'done';
}

/** Creates a confirmed user (no session) with the given zone and onboarding step (SPEC-203). */
export async function createProfileUser(
  options: ProfileUserOptions,
): Promise<{ userId: string; email: string }> {
  const { url, serviceRoleKey } = supabaseLocalEnv();
  const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false } });
  const created = await admin.auth.admin.createUser({
    email: options.email,
    password: `pw-${randomBytes(12).toString('hex')}`,
    email_confirm: true,
    user_metadata: { timezone: options.timezone ?? 'Europe/Paris' },
  });
  if (created.error !== null) throw new Error(`createUser : ${created.error.message}`);
  const { serviceDb, sql } = await import('@learny/db');
  await serviceDb().execute(sql`
    update public.profiles set onboarding_step = ${options.onboardingStep ?? 'done'}::onboarding_step
    where id = ${created.data.user.id}::uuid
  `);
  return { userId: created.data.user.id, email: options.email };
}

/** Deletes every user whose e-mail starts with `prefix` (cascades to their rows). */
export async function deleteUsersByEmailPrefix(prefix: string): Promise<void> {
  const { serviceDb, sql } = await import('@learny/db');
  await serviceDb().execute(sql`delete from auth.users where email like ${`${prefix}%`}`);
}
