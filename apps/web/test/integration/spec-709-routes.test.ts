// Integration tests of the « Modèles d'IA » routes (SPEC-709 ET-1, CA-3). The route wrapper runs
// for real (session, validation, idempotency, problem+json); only the rate limiter and the origin
// guard are replaced by their no-op implementations.
import { randomUUID } from 'node:crypto';

import { testApiHandler } from 'next-test-api-route-handler';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { aiTaskModels, closeDb, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { createServiceContext } from '@learny/services';
import { createCredential } from '@learny/services/ai/credentials';
import { qualifyCredential } from '@learny/services/ai/qualify';

import { GET, PATCH } from '../../app/api/v1/me/ai/models/route';
import { noopOriginGuard, setOriginGuard } from '../../lib/api/origin';
import { noopRateLimiter, setRateLimiter } from '../../lib/api/rate-limit';
import { setSessionResolver } from '../../lib/api/session';

const PREFIX = 'sdd-709-routes-';
const FIXED = new Date('2026-11-11T12:20:00Z');
const MODEL = 'claude-personal-709-routes';
const SECRET = 'sk-test-709-routes-a91F'; // learny-test-only

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

interface User {
  userId: string;
  email: string;
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

function ctxOf(user: User) {
  return createServiceContext({
    userId: user.userId,
    email: user.email,
    requestId: randomUUID(),
    clock: new TestClock(),
  });
}

async function qualifiedKey(user: User): Promise<string> {
  const created = await createCredential(ctxOf(user), {
    provider: 'anthropic',
    modelIds: [MODEL],
    apiKey: SECRET,
  });
  if (!created.ok) throw created.error;
  const qualified = await qualifyCredential(ctxOf(user), created.value.id, MODEL, {
    mockScenario: 'qualification-success',
  });
  if (!qualified.ok) throw qualified.error;
  return created.value.id;
}

interface ApiAnswer {
  status: number;
  body: Record<string, unknown>;
  replay: boolean;
}

async function call(
  options: {
    method?: 'GET' | 'PATCH';
    body?: unknown;
    idempotencyKey?: string | null;
  } = {},
): Promise<ApiAnswer> {
  let answer: ApiAnswer = { status: 0, body: {}, replay: false };
  await testApiHandler({
    appHandler: { GET, PATCH },
    url: 'http://localhost/api/v1/me/ai/models',
    test: async ({ fetch }) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (options.idempotencyKey !== null && options.idempotencyKey !== undefined) {
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
        replay: response.headers.get('idempotent-replayed') === 'true',
      };
    },
  });
  return answer;
}

async function cleanup(): Promise<void> {
  await serviceDb().execute(sql`delete from auth.users where email like ${`${PREFIX}%`}`);
}

async function assignmentCount(userId: string): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(sql`
    select count(*)::int as count from public.ai_task_models where user_id = ${userId}::uuid
  `);
  return rows[0]?.count ?? 0;
}

beforeAll(() => {
  setOriginGuard(noopOriginGuard);
  setRateLimiter(noopRateLimiter);
});

afterEach(async () => {
  restoreSession();
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe('[SPEC-709] routes de l’onglet Modèles d’IA', () => {
  it('CA-2 — GET rend l’état des cinq tâches et la carte masquée, jamais la clé', async () => {
    const user = await createUser('get');
    const credentialId = await qualifiedKey(user);
    asUser(user);

    const answer = await call();
    expect(answer.status).toBe(200);
    const tasks = answer.body.tasks as Array<Record<string, unknown>>;
    expect(tasks).toHaveLength(5);
    const providers = answer.body.providers as Array<Record<string, unknown>>;
    expect(providers[0]?.origin).toBe('provided');
    expect(providers.some((card) => card.id === credentialId)).toBe(true);
    const personal = providers.find((card) => card.id === credentialId);
    expect(personal?.keyMasked).toBe('sk-••••••••a91F');
    const serialized = JSON.stringify(answer.body);
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toContain('encrypted');
  });

  it('CA-3 — PATCH idempotent : deux envois identiques ne créent qu’une écriture', async () => {
    const user = await createUser('idempotent');
    const credentialId = await qualifiedKey(user);
    asUser(user);
    const key = 'spec-709-replay';
    const body = { action: 'assign', task: 'tutor', credentialId, modelId: MODEL };

    const first = await call({ method: 'PATCH', body, idempotencyKey: key });
    expect(first.status).toBe(200);
    expect(first.replay).toBe(false);
    const second = await call({ method: 'PATCH', body, idempotencyKey: key });
    expect(second.status).toBe(200);
    expect(second.replay).toBe(true);
    expect(second.body).toEqual(first.body);
    expect(await assignmentCount(user.userId)).toBe(1);

    // A different key replays the same business effect: the upsert stays unique.
    const third = await call({
      method: 'PATCH',
      body,
      idempotencyKey: 'spec-709-replay-2',
    });
    expect(third.status).toBe(200);
    expect(await assignmentCount(user.userId)).toBe(1);
  });

  it('CA-3 — un corps invalide répond 400 sans écrire', async () => {
    const user = await createUser('invalid');
    asUser(user);
    const answer = await call({
      method: 'PATCH',
      body: { action: 'assign', task: 'tutor', modelId: '' },
      idempotencyKey: 'spec-709-invalid',
    });
    expect(answer.status).toBe(400);
    expect(answer.body.code).toBe('VALIDATION_FAILED');
    expect(await assignmentCount(user.userId)).toBe(0);
  });

  it('CA-3 — la clé d’un autre apprenant répond 404 sans la révéler', async () => {
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    const credentialId = await qualifiedKey(alice);
    asUser(bob);
    const answer = await call({
      method: 'PATCH',
      body: { action: 'assign', task: 'tutor', credentialId, modelId: MODEL },
      idempotencyKey: 'spec-709-foreign',
    });
    expect(answer.status).toBe(404);
    expect(answer.body.code).toBe('NOT_FOUND');
    expect(JSON.stringify(answer.body)).not.toContain(alice.userId);
    expect(await assignmentCount(bob.userId)).toBe(0);
  });

  it('EF-3 — un modèle non qualifié est refusé côté serveur (422)', async () => {
    const user = await createUser('unqualified');
    const created = await createCredential(ctxOf(user), {
      provider: 'anthropic',
      modelIds: [MODEL],
      apiKey: SECRET,
    });
    if (!created.ok) throw created.error;
    asUser(user);
    const answer = await call({
      method: 'PATCH',
      body: {
        action: 'assign',
        task: 'tutor',
        credentialId: created.value.id,
        modelId: MODEL,
      },
      idempotencyKey: 'spec-709-unqualified',
    });
    expect(answer.status).toBe(422);
    expect(answer.body.code).toBe('AI_MODEL_NOT_QUALIFIED');
    const rows = await serviceDb()
      .select({ task: aiTaskModels.task })
      .from(aiTaskModels)
      .where(sql`${aiTaskModels.userId} = ${user.userId}::uuid`);
    expect(rows).toHaveLength(0);
  });
});
