// Integration tests of the notification-settings routes (SPEC-708 ET-1, ET-3, CA-4).
//
// The real API wrapper runs: session, origin guard, validation, idempotency storage, RLS service
// and problem+json. Only the rate limiter and the origin guard are replaced by their no-op
// implementations and the session is injected, like the other route suites.
import { randomUUID } from 'node:crypto';

import { testApiHandler } from 'next-test-api-route-handler';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';

import { GET, PATCH } from '../../app/api/v1/me/notification-settings/route';
import { noopOriginGuard, setOriginGuard } from '../../lib/api/origin';
import { noopRateLimiter, setRateLimiter } from '../../lib/api/rate-limit';
import { setSessionResolver } from '../../lib/api/session';

const PREFIX = 'sdd-708-routes-';

interface User {
  userId: string;
  email: string;
}

interface ApiAnswer {
  status: number;
  body: Record<string, unknown>;
  headers: Headers;
}

let restoreSession: () => void = () => undefined;

function asUser(user: User): void {
  restoreSession = setSessionResolver(() =>
    Promise.resolve({ userId: user.userId, email: user.email, emailConfirmed: true }),
  );
}

async function createUser(label: string): Promise<User> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const userId = await serviceDb().transaction(
    async (tx) => (await createTestUser(tx, { email })).id,
  );
  return { userId, email };
}

async function call(
  options: {
    method?: 'GET' | 'PATCH';
    body?: unknown;
    idempotencyKey?: string;
  } = {},
): Promise<ApiAnswer> {
  let answer: ApiAnswer = { status: 0, body: {}, headers: new Headers() };
  await testApiHandler({
    appHandler: { GET, PATCH },
    url: 'http://localhost/api/v1/me/notification-settings',
    test: async ({ fetch }) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (options.idempotencyKey !== undefined) {
        headers['idempotency-key'] = options.idempotencyKey;
      }
      const response = await fetch({
        method: options.method ?? 'GET',
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      const text = await response.text();
      answer = {
        status: response.status,
        body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>),
        headers: response.headers,
      };
    },
  });
  return answer;
}

async function updatedAt(userId: string): Promise<string> {
  const rows = await serviceDb().execute<{ updated_at: string }>(sql`
    select updated_at::text as updated_at from public.notification_settings
     where user_id = ${userId}::uuid
  `);
  return rows[0]?.updated_at ?? '';
}

beforeAll(() => {
  setOriginGuard(noopOriginGuard);
  setRateLimiter(noopRateLimiter);
});

afterEach(() => {
  restoreSession();
  setOriginGuard(noopOriginGuard);
  setRateLimiter(noopRateLimiter);
});

afterAll(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

describe('[SPEC-708] service et API', () => {
  it('CA-1 — GET rend les six types et le compteur, PATCH le met à jour', async () => {
    const user = await createUser('get');
    asUser(user);
    const initial = await call();
    expect(initial.status).toBe(200);
    expect(initial.body).toMatchObject({
      channels: { app: true, email: true, browser: true },
      activeTypeCount: 6,
      digestTime: '08:00',
      quiet: { start: '21:00', end: '08:00', crossesMidnight: true, empty: false },
    });

    const patched = await call({
      method: 'PATCH',
      body: { types: { validation: false, course: false } },
      idempotencyKey: `types-${randomUUID().slice(0, 8)}`,
    });
    expect(patched.status).toBe(200);
    expect(patched.body.activeTypeCount).toBe(4);
    const reloaded = await call();
    expect(reloaded.body.activeTypeCount).toBe(4);
    expect(reloaded.headers.get('cache-control')).toBe('no-store');
  });

  it('CA-2, ET-3 — le canal application reste actif et le patch partiel garde les autres champs', async () => {
    const user = await createUser('channels');
    asUser(user);
    const patched = await call({
      method: 'PATCH',
      body: { channels: { email: false } },
      idempotencyKey: `channels-${randomUUID().slice(0, 8)}`,
    });
    expect(patched.status).toBe(200);
    expect(patched.body.channels).toEqual({ app: true, email: false, browser: true });
    expect(patched.body.types).toMatchObject({ revision: true, relaunch: true });

    const refused = await call({
      method: 'PATCH',
      body: { channels: { app: false } },
      idempotencyKey: `app-${randomUUID().slice(0, 8)}`,
    });
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe('VALIDATION_FAILED');
    const current = await call();
    expect(current.body.channels).toMatchObject({ app: true, email: false });
  });

  it('CA-4, CL-1 — un corps invalide ou vide renvoie 400 sans écriture', async () => {
    const user = await createUser('invalid');
    asUser(user);
    const before = await updatedAt(user.userId);
    for (const body of [{}, { types: {} }, { quietEnd: '99:99' }, { maxPerDay: 4 }]) {
      const answer = await call({
        method: 'PATCH',
        body,
        idempotencyKey: `invalid-${randomUUID().slice(0, 8)}`,
      });
      expect(answer.status).toBe(400);
      expect(answer.body.code).toBe('VALIDATION_FAILED');
    }
    const after = await updatedAt(user.userId);
    expect(after).toBe(before);
  });

  it('CA-4, CL-2 — une version obsolète renvoie 409 et l’état courant', async () => {
    const user = await createUser('conflict');
    asUser(user);
    const stale = await call({
      method: 'PATCH',
      body: { digestTime: '09:00', expectedUpdatedAt: '2020-01-01T00:00:00.000Z' },
      idempotencyKey: `stale-${randomUUID().slice(0, 8)}`,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('CONFLICT');
    const current = await call();
    expect(current.body.digestTime).toBe('08:00');

    const replay = await call({
      method: 'PATCH',
      body: {
        digestTime: '09:00',
        expectedUpdatedAt: current.body.updatedAt as string,
      },
      idempotencyKey: `fresh-${randomUUID().slice(0, 8)}`,
    });
    expect(replay.status).toBe(200);
    expect(replay.body.digestTime).toBe('09:00');
  });

  it('CA-4 — deux requêtes identiques avec la même clé ne rejouent pas le service', async () => {
    const user = await createUser('idem');
    asUser(user);
    const key = `idem-${randomUUID().slice(0, 8)}`;
    const body = { weekendQuiet: false, quietStart: '22:00' };
    const first = await call({ method: 'PATCH', body, idempotencyKey: key });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ weekendQuiet: false, quiet: { start: '22:00' } });
    const version = await updatedAt(user.userId);

    const second = await call({ method: 'PATCH', body, idempotencyKey: key });
    expect(second.status).toBe(200);
    expect(second.headers.get('idempotent-replayed')).toBe('true');
    expect(second.body).toEqual(first.body);
    // One row, one write: the replay did not even bump `updated_at`.
    expect(await updatedAt(user.userId)).toBe(version);
    const rows = await serviceDb().execute<{ total: number }>(sql`
      select count(*)::int as total from public.notification_settings
       where user_id = ${user.userId}::uuid
    `);
    expect(rows[0]?.total).toBe(1);
  });

  it('CA-4, CL-1 — un second utilisateur lit ses réglages et un profil inconnu répond 404', async () => {
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    asUser(alice);
    await call({
      method: 'PATCH',
      body: { types: { revision: false }, channels: { email: false } },
      idempotencyKey: `alice-${randomUUID().slice(0, 8)}`,
    });
    asUser(bob);
    const his = await call();
    expect(his.status).toBe(200);
    expect(his.body.activeTypeCount).toBe(6);
    expect(his.body.channels).toEqual({ app: true, email: true, browser: true });

    asUser({
      userId: randomUUID(),
      email: `${PREFIX}orphan-${randomUUID().slice(0, 8)}@test.learny.test`,
    });
    const orphan = await call();
    expect(orphan.status).toBe(404);
    expect(orphan.body.code).toBe('NOT_FOUND');
  });
});
