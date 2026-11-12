import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { HeaderDto } from '@learny/contracts';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme } from '@learny/db/testing';
import { createNotification } from '@learny/testing';
import {
  createTestSession,
  deleteTestSession,
  supabaseLocalEnv,
  type TestSession,
} from '@learny/testing/supabase';

import { POST as signOutRoute } from '../../app/api/v1/auth/sign-out/route';
import { GET as getHeader } from '../../app/api/v1/me/header/route';

const BASE = 'http://localhost:3000';
const NO_SEGMENT = { params: Promise.resolve({}) };

const sessions: TestSession[] = [];

beforeAll(() => {
  const env = supabaseLocalEnv();
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', env.url);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', env.anonKey);
  vi.stubEnv('TRUST_PROXY', 'true');
});

beforeEach(() => {
  for (const level of ['error', 'warn', 'info', 'log'] as const) {
    vi.spyOn(console, level).mockImplementation(() => undefined);
  }
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(async () => {
  vi.restoreAllMocks();
  while (sessions.length > 0) {
    const session = sessions.pop();
    if (session !== undefined) await deleteTestSession(session);
  }
});

afterAll(async () => {
  await closeDb();
  vi.unstubAllEnvs();
});

async function session(): Promise<TestSession> {
  const created = await createTestSession();
  sessions.push(created);
  return created;
}

function request(method: 'GET' | 'POST', path: string, cookie?: string): NextRequest {
  return new NextRequest(`${BASE}${path}`, {
    method,
    headers: {
      origin: BASE,
      ...(cookie === undefined ? {} : { cookie }),
    },
  });
}

async function readHeader(sessionValue: TestSession): Promise<Response> {
  return getHeader(request('GET', '/api/v1/me/header', sessionValue.cookieHeader), NO_SEGMENT);
}

async function body(response: Response): Promise<HeaderDto> {
  expect(response.status).toBe(200);
  return HeaderDto.parse(await response.json());
}

interface SeedOptions {
  firstName?: string | null;
  lastName?: string | null;
  active?: number;
  paused?: number;
  completed?: number;
  unread?: number;
  read?: number;
}

/** Profile identity, formations of every status and notifications, all owned by one learner. */
async function seed(userId: string, options: SeedOptions = {}): Promise<void> {
  const active = options.active ?? 3;
  const paused = options.paused ?? 1;
  const completed = options.completed ?? 1;
  const unread = options.unread ?? 2;
  const read = options.read ?? 1;

  await serviceDb().transaction(async (tx) => {
    await tx.execute(sql`
      update public.profiles
      set first_name = ${options.firstName === undefined ? 'Alex' : options.firstName},
          last_name = ${options.lastName === undefined ? 'Perrin' : options.lastName},
          onboarding_step = 'done'
      where id = ${userId}::uuid
    `);

    for (let index = 0; index < active; index += 1) {
      await createTestProgramme(tx, userId, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
        title: `Formation active ${String(index + 1)}`,
      });
    }
    for (let index = 0; index < paused; index += 1) {
      const pausedFormation = await createTestProgramme(tx, userId, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
        title: `Formation en pause ${String(index + 1)}`,
      });
      await tx.execute(sql`
        update public.formations set status = 'paused'
        where id = ${pausedFormation.formationId}::uuid
      `);
    }
    for (let index = 0; index < completed; index += 1) {
      const completedFormation = await createTestProgramme(tx, userId, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
        title: `Formation terminée ${String(index + 1)}`,
      });
      await tx.execute(sql`
        update public.formations set status = 'completed'
        where id = ${completedFormation.formationId}::uuid
      `);
    }

    const notifications: string[] = [];
    for (let index = 0; index < unread + read; index += 1) {
      const notification = await createNotification(tx, {
        userId,
        title: `Notification ${String(index + 1)}`,
        dedupeKey: `spec-305:${userId}:${String(index)}`,
      });
      notifications.push(notification.id);
    }
    for (const notificationId of notifications.slice(0, read)) {
      await tx.execute(sql`
        update public.notifications set read_at = '2026-11-11T10:00:00Z'::timestamptz
        where id = ${notificationId}::uuid
      `);
    }
  });
}

describe('[SPEC-305] Coquille : en-tête figé et menu Mon compte service', () => {
  it('lit l’identité, les formations actives et les non lues, et isole deux utilisateurs (CA-2, CA-4)', async () => {
    const first = await session();
    const other = await session();
    await seed(first.userId, { active: 3, paused: 1, completed: 1, unread: 2, read: 1 });
    await seed(other.userId, {
      firstName: 'Sam',
      lastName: 'Durand',
      active: 1,
      paused: 0,
      completed: 0,
      unread: 0,
      read: 0,
    });

    const header = await body(await readHeader(first));
    expect(header).toMatchObject({
      firstName: 'Alex',
      lastName: 'Perrin',
      activeFormationCount: 3,
      unreadNotificationCount: 2,
    });
    expect(header.emailLabel).toMatch(/^[^@]\*\*\*@test\.learny\.test$/);
    expect(JSON.stringify(header)).not.toContain(first.email);

    const isolated = await body(await readHeader(other));
    expect(isolated).toMatchObject({
      firstName: 'Sam',
      lastName: 'Durand',
      activeFormationCount: 1,
      unreadNotificationCount: 0,
    });
  });

  it('replie l’identité sans prénom sur l’adresse abrégée et compte zéro (CL-1)', async () => {
    const first = await session();
    await seed(first.userId, {
      firstName: null,
      lastName: null,
      active: 0,
      paused: 2,
      completed: 1,
      unread: 0,
      read: 0,
    });

    const header = await body(await readHeader(first));
    expect(header.firstName).toBeNull();
    expect(header.lastName).toBeNull();
    expect(header.activeFormationCount).toBe(0);
    expect(header.unreadNotificationCount).toBe(0);
    expect(header.emailLabel).not.toBeNull();
    expect(header.emailLabel).not.toBe(first.email);
  });

  it('ferme la session puis refuse la requête protégée avec une erreur sûre (CA-3)', async () => {
    const first = await session();
    await seed(first.userId);
    expect((await readHeader(first)).status).toBe(200);

    const closed = await signOutRoute(
      request('POST', '/api/v1/auth/sign-out', first.cookieHeader),
      NO_SEGMENT,
    );
    expect(closed.status).toBe(204);
    expect(closed.headers.getSetCookie().some((line) => /^sb-.*Max-Age=0/i.test(line))).toBe(true);

    const refused = await readHeader(first);
    expect(refused.status).toBe(401);
    expect(refused.headers.get('content-type')).toContain('application/problem+json');
    const problem = (await refused.json()) as { code: string; detail: string };
    expect(problem.code).toBe('UNAUTHENTICATED');
    expect(JSON.stringify(problem)).not.toContain(first.email);
    expect(JSON.stringify(problem)).not.toContain('stack');

    // Idempotent: a second sign-out without a valid session is still a 204.
    expect((await signOutRoute(request('POST', '/api/v1/auth/sign-out'), NO_SEGMENT)).status).toBe(
      204,
    );
  });

  it('répond sans cookie par une erreur 401 sans donnée apprenant (CA-3)', async () => {
    const anonymous = await getHeader(request('GET', '/api/v1/me/header'), NO_SEGMENT);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers.get('content-type')).toContain('application/problem+json');
    const problem = (await anonymous.json()) as { code: string; detail: string };
    expect(problem.code).toBe('UNAUTHENTICATED');
    expect(JSON.stringify(problem)).not.toContain('Alex');
  });
});
