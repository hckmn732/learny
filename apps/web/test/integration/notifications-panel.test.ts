import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { NotificationListDto } from '@learny/contracts';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createNotification } from '@learny/testing';
import {
  createTestSession,
  deleteTestSession,
  supabaseLocalEnv,
  type TestSession,
} from '@learny/testing/supabase';

import { POST as readPost } from '../../app/api/v1/notifications/[id]/read/route';
import { POST as readAllPost } from '../../app/api/v1/notifications/read-all/route';
import { GET as listGet } from '../../app/api/v1/notifications/route';
import { GET as unreadCountGet } from '../../app/api/v1/notifications/unread-count/route';

const BASE = 'http://localhost:3000';
const EMPTY_SEGMENT = { params: Promise.resolve({}) };

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

function request(method: 'GET' | 'POST', cookie: string | null, path: string): NextRequest {
  const headers: Record<string, string> = { origin: BASE };
  if (cookie !== null) headers.cookie = cookie;
  return new NextRequest(`${BASE}${path}`, { method, headers });
}

async function list(sessionValue: TestSession, query = 'filter=all'): Promise<Response> {
  return listGet(
    request('GET', sessionValue.cookieHeader, `/api/v1/notifications?${query}`),
    EMPTY_SEGMENT,
  );
}

async function count(sessionValue: TestSession): Promise<Response> {
  return unreadCountGet(
    request('GET', sessionValue.cookieHeader, '/api/v1/notifications/unread-count'),
    EMPTY_SEGMENT,
  );
}

async function read(sessionValue: TestSession, id: string): Promise<Response> {
  return readPost(request('POST', sessionValue.cookieHeader, `/api/v1/notifications/${id}/read`), {
    params: Promise.resolve({ id }),
  });
}

async function readAll(sessionValue: TestSession): Promise<Response> {
  return readAllPost(
    request('POST', sessionValue.cookieHeader, '/api/v1/notifications/read-all'),
    EMPTY_SEGMENT,
  );
}

interface Seed {
  todayId: string;
  yesterdayId: string;
  earlierId: string;
}

async function seedInbox(userId: string): Promise<Seed> {
  return serviceDb().transaction(async (tx) => {
    await tx.execute(sql`
      update public.profiles set timezone = 'Europe/Paris' where id = ${userId}::uuid
    `);
    const today = await createNotification(tx, {
      userId,
      type: 'validation_soon',
      title: 'Quiz de validation à 14:00',
      body: 'Module 3 · Comptabilité générale, tentative 2.',
      href: '/accueil?cible=quiz',
      icon: 'clock',
      dedupeKey: `spec-306-today:${userId}`,
    });
    const yesterday = await createNotification(tx, {
      userId,
      type: 'new_gap',
      title: 'Nouvelle lacune repérée',
      body: 'Clé de comptabilisation confondue avec le type de pièce.',
      href: '/formations/f/lacunes',
      icon: 'alert-triangle',
      dedupeKey: `spec-306-yesterday:${userId}`,
    });
    const earlier = await createNotification(tx, {
      userId,
      type: 'weekly_review',
      title: 'Bilan de la semaine',
      body: '13 h d’étude, 86 % retenu à 1 mois.',
      href: '/formations/f/bilan',
      icon: 'bar-chart',
      dedupeKey: `spec-306-earlier:${userId}`,
    });
    await tx.execute(sql`
      update public.notifications
      set created_at = '2026-11-11T12:00:00Z'::timestamptz
      where id = ${today.id}::uuid
    `);
    await tx.execute(sql`
      update public.notifications
      set created_at = '2026-11-10T15:42:00Z'::timestamptz,
          read_at = '2026-11-10T18:00:00Z'::timestamptz
      where id = ${yesterday.id}::uuid
    `);
    await tx.execute(sql`
      update public.notifications
      set created_at = '2026-11-08T18:00:00Z'::timestamptz,
          read_at = '2026-11-09T08:00:00Z'::timestamptz
      where id = ${earlier.id}::uuid
    `);
    return { todayId: today.id, yesterdayId: yesterday.id, earlierId: earlier.id };
  });
}

async function body<T>(response: Response, schema: { parse: (value: unknown) => T }): Promise<T> {
  expect(response.status).toBe(200);
  return schema.parse(await response.json());
}

describe('[SPEC-306] Panneau des notifications service', () => {
  it('liste et groupe dans le fuseau du profil, sans que le filtre change le compteur (CA-1, CA-2)', async () => {
    const owner = await session();
    const seed = await seedInbox(owner.userId);

    const all = await body(await list(owner), NotificationListDto);
    expect(all.total).toBe(3);
    expect(all.unreadCount).toBe(1);
    expect(all.timezone).toBe('Europe/Paris');
    expect(all.items.map((item) => item.id)).toEqual([
      seed.todayId,
      seed.yesterdayId,
      seed.earlierId,
    ]);
    expect(all.items.map((item) => item.group)).toEqual(['today', 'yesterday', 'earlier']);
    expect(all.items[0]?.createdAt).toBe('2026-11-11T12:00:00.000Z');
    expect(all.items[0]?.readAt).toBeNull();
    expect(all.items[1]?.readAt).toBe('2026-11-10T18:00:00.000Z');

    const unread = await body(await list(owner, 'filter=unread'), NotificationListDto);
    expect(unread.items.map((item) => item.id)).toEqual([seed.todayId]);
    expect(unread.unreadCount).toBe(1);
    expect(unread.total).toBe(3);

    const countBody = (await (await count(owner)).json()) as { count: number };
    expect(countBody.count).toBe(1);
  });

  it('marque lue une notification, puis reste idempotent sur une seconde demande (CA-2, CL-1)', async () => {
    const owner = await session();
    const seed = await seedInbox(owner.userId);

    const first = (await (await read(owner, seed.todayId)).json()) as { unreadCount: number };
    expect(first.unreadCount).toBe(0);
    const rows = await serviceDb().execute<{ read_at: string }>(sql`
      select read_at::text from public.notifications where id = ${seed.todayId}::uuid
    `);
    const firstReadAt = rows[0]?.read_at;
    expect(firstReadAt).not.toBeNull();

    const second = (await (await read(owner, seed.todayId)).json()) as { unreadCount: number };
    expect(second.unreadCount).toBe(0);
    const after = await serviceDb().execute<{ read_at: string }>(sql`
      select read_at::text from public.notifications where id = ${seed.todayId}::uuid
    `);
    expect(after[0]?.read_at).toBe(firstReadAt);
  });

  it('marque tout lu, laisse zéro non lue et ne réécrit rien à la seconde invocation (CA-3)', async () => {
    const owner = await session();
    await seedInbox(owner.userId);

    const first = (await (await readAll(owner)).json()) as { unreadCount: number };
    expect(first.unreadCount).toBe(0);
    const rows = await serviceDb().execute<{ unread: number; stamps: string[] }>(sql`
      select (count(*) filter (where read_at is null))::int as unread,
             array_agg(read_at::text order by id) as stamps
        from public.notifications
       where user_id = ${owner.userId}::uuid
    `);
    expect(rows[0]?.unread).toBe(0);
    const stamps = rows[0]?.stamps ?? [];

    const second = (await (await readAll(owner)).json()) as { unreadCount: number };
    expect(second.unreadCount).toBe(0);
    const after = await serviceDb().execute<{ unread: number; stamps: string[] }>(sql`
      select (count(*) filter (where read_at is null))::int as unread,
             array_agg(read_at::text order by id) as stamps
        from public.notifications
       where user_id = ${owner.userId}::uuid
    `);
    expect(after[0]?.unread).toBe(0);
    expect(after[0]?.stamps).toEqual(stamps);

    const empty = await body(await list(owner, 'filter=unread'), NotificationListDto);
    expect(empty.items).toEqual([]);
    expect(empty.unreadCount).toBe(0);
  });

  it('refuse la notification d’un autre utilisateur sans la marquer ni la révéler (CA-4)', async () => {
    const owner = await session();
    const stranger = await session();
    const seed = await seedInbox(owner.userId);

    const refused = await read(stranger, seed.todayId);
    expect(refused.status).toBe(404);
    const problem = (await refused.json()) as { code: string; detail: string };
    expect(problem.code).toBe('NOT_FOUND');
    expect(problem.detail).not.toContain('Quiz de validation');

    const ownerRow = await serviceDb().execute<{ unread: number }>(sql`
      select (count(*) filter (where read_at is null))::int as unread
        from public.notifications
       where id = ${seed.todayId}::uuid
    `);
    expect(ownerRow[0]?.unread).toBe(1);

    const strangerList = await body(await list(stranger), NotificationListDto);
    expect(strangerList.items).toEqual([]);
    expect(strangerList.total).toBe(0);
    expect(strangerList.unreadCount).toBe(0);
  });

  it('répond sans cookie par une erreur sûre, sans donnée apprenant (CA-4)', async () => {
    const anonymous = await listGet(request('GET', null, '/api/v1/notifications'), EMPTY_SEGMENT);
    expect(anonymous.status).toBe(401);
    const problem = (await anonymous.json()) as Record<string, unknown>;
    expect(problem.code).toBe('UNAUTHENTICATED');
    expect(JSON.stringify(problem)).not.toMatch(/@|Quiz|notification/i);
  });
});
