import { randomBytes } from 'node:crypto';

import { createClient } from '@supabase/supabase-js';

import { createApiClient } from '@learny/api-client';
import { activeLegalVersions } from '@learny/config';
import { serviceDb, sql } from '@learny/db';

import { createCourse } from './factories/course';
import { createModule } from './factories/module';
import { supabaseLocalEnv } from './supabase';

export interface NativeClientStep {
  name: string;
  status: number;
  durationMs: number;
  ok: boolean;
  error?: string;
}

export interface NativeClientScenarioResult {
  ok: boolean;
  steps: NativeClientStep[];
  userId?: string | undefined;
  formationId?: string | undefined;
  requestCount: number;
}

export interface NativeClientScenarioOptions {
  apiUrl: string;
  fetch?: typeof fetch;
  email?: string;
  password?: string;
}

function forbiddenHeaders(init: RequestInit | undefined): void {
  const headers = new Headers(init?.headers);
  if (headers.has('origin')) throw new Error('Un client natif ne doit pas envoyer Origin.');
  if (headers.has('cookie')) throw new Error('Un client natif ne doit pas envoyer Cookie.');
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface AuthTokenResponse {
  access_token: string;
  refresh_token: string;
  user: { id: string };
}

async function authJson<T>(
  send: typeof fetch,
  url: string,
  anonKey: string,
  path: string,
  body: Record<string, unknown>,
): Promise<T> {
  const response = await send(new URL(path, `${url}/`), {
    method: 'POST',
    headers: { apikey: anonKey, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const value = (await response.json()) as T & {
    msg?: string;
    error_description?: string;
    message?: string;
  };
  if (!response.ok) {
    throw new Error(
      value.error_description ??
        value.msg ??
        value.message ??
        `Supabase ${String(response.status)}`,
    );
  }
  return value;
}

/** Runs the complete cookie-free client scenario against Supabase and apps/api. */
export async function runNativeClientScenario(
  options: NativeClientScenarioOptions,
): Promise<NativeClientScenarioResult> {
  const local = supabaseLocalEnv();
  const localEnvKeys = {
    NEXT_PUBLIC_SUPABASE_URL: local.url,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: local.anonKey,
    SUPABASE_SERVICE_ROLE_KEY: local.serviceRoleKey,
    SUPABASE_JWT_SECRET: local.jwtSecret,
  } as const;
  const previousEnv = new Map(
    Object.keys(localEnvKeys).map((key) => [key, process.env[key]] as const),
  );
  for (const [key, value] of Object.entries(localEnvKeys)) process.env[key] ??= value;
  const transport = options.fetch ?? globalThis.fetch;
  const email = options.email ?? `native-${randomBytes(5).toString('hex')}@test.learny.test`;
  const password = options.password ?? `Native-${randomBytes(12).toString('base64url')}`;
  const steps: NativeClientStep[] = [];
  let requestCount = 0;
  let userId: string | undefined;
  let formationId: string | undefined;

  const nativeFetch: typeof fetch = async (input, init) => {
    forbiddenHeaders(init);
    requestCount += 1;
    return transport(input, init);
  };
  const admin = createClient(local.url, local.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let accessToken = '';
  let refreshToken = '';
  const client = createApiClient({
    baseUrl: options.apiUrl.replace(/\/+$/, ''),
    fetch: nativeFetch,
    getAccessToken: () => accessToken,
    refreshAccessToken: async () => {
      const session = await authJson<AuthTokenResponse>(
        nativeFetch,
        local.url,
        local.anonKey,
        '/auth/v1/token?grant_type=refresh_token',
        { refresh_token: refreshToken },
      );
      accessToken = session.access_token;
      refreshToken = session.refresh_token;
      return accessToken;
    },
  });

  async function step<T>(name: string, status: number, work: () => Promise<T>): Promise<T> {
    const started = performance.now();
    try {
      const value = await work();
      steps.push({ name, status, durationMs: performance.now() - started, ok: true });
      return value;
    } catch (error) {
      steps.push({
        name,
        status: 0,
        durationMs: performance.now() - started,
        ok: false,
        error: messageOf(error),
      });
      throw error;
    }
  }

  try {
    await step('Inscription', 200, async () => {
      const registered = await authJson<{ id?: string; user?: { id: string } }>(
        nativeFetch,
        local.url,
        local.anonKey,
        '/auth/v1/signup',
        {
          email,
          password,
          data: { first_name: 'Client', last_name: 'Natif', timezone: 'Europe/Paris' },
        },
      );
      userId = registered.user?.id ?? registered.id;
      if (userId === undefined) throw new Error('Supabase n’a pas créé le compte.');
      const confirmed = await admin.auth.admin.updateUserById(userId, { email_confirm: true });
      if (confirmed.error !== null) throw new Error(confirmed.error.message);
      const session = await authJson<AuthTokenResponse>(
        nativeFetch,
        local.url,
        local.anonKey,
        '/auth/v1/token?grant_type=password',
        { email, password },
      );
      accessToken = session.access_token;
      refreshToken = session.refresh_token;

      const versions = activeLegalVersions();
      await serviceDb().execute(sql`
        insert into public.legal_acceptances (user_id, document, version)
        values
          (${userId}::uuid, 'cgu'::public.legal_document, ${versions.cgu}),
          (${userId}::uuid, 'privacy'::public.legal_document, ${versions.privacy})
      `);
    });

    await step('Profil', 200, () => client.api.meGet({}));
    await step('Accueil', 200, () => client.api.homeGet({}));
    const idempotencyKey = crypto.randomUUID();
    const created = await step('Création idempotente', 201, () =>
      client.api.formationsCreate(
        { body: { title: 'Formation du client natif' } },
        { idempotencyKey },
      ),
    );
    formationId = created.formation.id;
    const replayed = await step('Rejeu idempotent', 201, () =>
      client.api.formationsCreate(
        { body: { title: 'Formation du client natif' } },
        { idempotencyKey },
      ),
    );
    if (replayed.formation.id !== created.formation.id) {
      throw new Error('Le rejeu idempotent a créé une autre formation.');
    }

    await step('Discussion en flux', 200, async () => {
      const tutor = await serviceDb().transaction(async (tx) => {
        const module = await createModule(tx, {
          ownerId: userId ?? '',
          formationId: created.formation.id,
          status: 'open',
          chapters: ['Discussion native'],
        });
        const course = await createCourse(tx, {
          ownerId: userId ?? '',
          formationId: created.formation.id,
          moduleId: module.id,
        });
        const chapterId = module.chapterIds[0];
        if (chapterId === undefined) throw new Error('Chapitre de discussion absent.');
        return { courseId: course.id, chapterId };
      });
      const conversation = await client.api.courseConversationCreate({
        params: { cid: tutor.courseId },
        body: { chapterId: tutor.chapterId },
      });
      let text = '';
      let sources = 0;
      let followUps = 0;
      for await (const part of client.streamTutorReply(conversation.id, {
        text: 'Explique-moi cette notion.',
        context: { include: { formation: true, chapter: true, profile: true } },
      })) {
        if (part.type === 'text-delta') text += part.delta;
        if (part.type === 'data-sources') sources = part.data.sources.length;
        if (part.type === 'data-follow-ups') followUps = part.data.followUps.length;
      }
      if (text === '' || sources === 0 || followUps === 0) {
        throw new Error('Le flux ne contient pas le texte, les sources et les suites.');
      }
    });

    accessToken = `expired.${crypto.randomUUID()}`;
    await step('Rafraîchissement du jeton', 200, () => client.api.meGet({}));

    return {
      ok: true,
      steps,
      userId,
      formationId,
      requestCount,
    };
  } catch {
    return {
      ok: false,
      steps,
      ...(userId === undefined ? {} : { userId }),
      ...(formationId === undefined ? {} : { formationId }),
      requestCount,
    };
  } finally {
    if (userId !== undefined) await admin.auth.admin.deleteUser(userId);
    for (const [key, value] of previousEnv) {
      if (value === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = value;
    }
  }
}
