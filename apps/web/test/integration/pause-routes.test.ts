// Route integration tests of the mode pause (SPEC-721 ET-1, CA-3, CL-1, CL-3).
//
// The real `handler()` runs (session, Zod validation, idempotency, problem+json); only the rate
// limiter and the origin guard are replaced. Postgres is real, so the pause row, the frozen
// planning and the journal rows are read back exactly as the browser sees them.
import { randomUUID } from 'node:crypto';

import { beforeEach, afterAll, afterEach, describe, expect, it } from 'vitest';

import { createApp } from '@learny/api';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { type ApiTarget, requestApi, setApiAppFactory } from '@learny/testing/api';

import {
  DELETE as endRoute,
  GET as stateRoute,
  POST as startRoute,
} from '../../app/api/v1/me/pause/route';
import { noopOriginGuard, setOriginGuard } from '../../lib/api/origin';
import { noopRateLimiter, setRateLimiter } from '../../lib/api/rate-limit';
import { setSessionResolver } from '../../lib/api/session';

let apiTarget: ApiTarget = 'next';

setApiAppFactory(createApp);

const PAUSE = { GET: stateRoute, POST: startRoute, DELETE: endRoute };
const PREFIX = 'sdd-721-routes-';

interface User {
  userId: string;
  email: string;
}

interface ApiAnswer {
  status: number;
  body: Record<string, unknown>;
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
    async (tx) => (await createTestUser(tx, { email, timezone: 'Europe/Paris' })).id,
  );
  return { userId, email };
}

async function call(
  appHandler: unknown,
  options: { method: string; body?: unknown; idempotencyKey?: string },
): Promise<ApiAnswer> {
  let answer: ApiAnswer = { status: 0, body: {} };
  await requestApi(apiTarget, {
    appHandler: appHandler as never,
    url: 'http://localhost/api/v1/me/pause',
    test: async ({ fetch }) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (options.idempotencyKey !== undefined) headers['idempotency-key'] = options.idempotencyKey;
      const response = await fetch({
        method: options.method,
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
      const text = await response.text();
      answer = {
        status: response.status,
        body: text === '' ? {} : (JSON.parse(text) as Record<string, unknown>),
      };
    },
  });
  return answer;
}

async function countPauses(userId: string): Promise<number> {
  const rows = await serviceDb().execute<{ n: number }>(
    sql`select count(*)::int as n from public.pauses where user_id = ${userId}::uuid`,
  );
  return rows[0]?.n ?? 0;
}

async function countActions(userId: string, kind: string): Promise<number> {
  const rows = await serviceDb().execute<{ n: number }>(
    sql`select count(*)::int as n from public.automation_actions
        where user_id = ${userId}::uuid and automation = 'pause' and kind = ${kind}`,
  );
  return rows[0]?.n ?? 0;
}

afterEach(async () => {
  restoreSession();
  restoreSession = () => undefined;
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
});

afterAll(async () => {
  setOriginGuard(noopOriginGuard);
  setRateLimiter(noopRateLimiter);
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

describe.each(['next', 'hono'] as const)('[SPEC-721] service et API [SPEC-1101] (%s)', (target) => {
  beforeEach(() => {
    apiTarget = target;
  });
  it('CA-3, CL-1, CL-3 — état isolé, date passée 422, double envoi idempotent', async () => {
    setOriginGuard(noopOriginGuard);
    setRateLimiter(noopRateLimiter);
    const alex = await createUser('routes');
    const other = await createUser('other');

    asUser(alex);
    const initial = await call(PAUSE, { method: 'GET' });
    expect(initial.status).toBe(200);
    expect(initial.body.status).toBe('none');

    // CL-3 — a date before the local day is a 422 without any write.
    const invalid = await call(PAUSE, {
      method: 'POST',
      body: { endDate: '2026-11-10', diagnosticEnabled: true },
      idempotencyKey: randomUUID(),
    });
    expect(invalid.status).toBe(422);
    expect(invalid.body.code).toBe('VALIDATION_FAILED');
    expect(await countPauses(alex.userId)).toBe(0);

    const key = randomUUID();
    const started = await call(PAUSE, {
      method: 'POST',
      body: { endDate: '2026-11-14', diagnosticEnabled: false },
      idempotencyKey: key,
    });
    expect(started.status).toBe(200);
    expect(started.body.status).toBe('active');
    expect(started.body.endsOn).toBe('2026-11-14');
    expect(await countPauses(alex.userId)).toBe(1);

    // CA-3 — two identical requests create neither a second pause nor a second journal row.
    const replayed = await call(PAUSE, {
      method: 'POST',
      body: { endDate: '2026-11-14', diagnosticEnabled: false },
      idempotencyKey: key,
    });
    expect(replayed.status).toBe(200);
    expect(await countPauses(alex.userId)).toBe(1);
    expect(await countActions(alex.userId, 'pause_started')).toBe(1);

    // CA-3 — the other learner sees no pause of the first one.
    asUser(other);
    const isolated = await call(PAUSE, { method: 'GET' });
    expect(isolated.status).toBe(200);
    expect(isolated.body.status).toBe('none');
    expect(isolated.body.pausedFormationIds).toEqual([]);

    asUser(alex);
    const ended = await call(PAUSE, { method: 'DELETE', idempotencyKey: randomUUID() });
    expect(ended.status).toBe(200);
    expect(ended.body.status).toBe('ended');
    const endedAgain = await call(PAUSE, { method: 'DELETE', idempotencyKey: randomUUID() });
    expect(endedAgain.status).toBe(200);
    expect(await countActions(alex.userId, 'pause_ended')).toBe(1);
  });
});
