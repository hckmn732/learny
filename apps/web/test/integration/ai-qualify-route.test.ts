// Integration of POST /api/v1/me/ai/credentials/:id/qualify (SPEC-506 CA-3, EF-3).
// The wrapper, session, ownership check and problem+json run for real; the model is simulated.
import { randomUUID } from 'node:crypto';

import { testApiHandler } from 'next-test-api-route-handler';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { createServiceContext } from '@learny/services';
import { createCredential } from '@learny/services/ai/credentials';

import { POST } from '../../app/api/v1/me/ai/credentials/[id]/qualify/route';
import { noopOriginGuard, setOriginGuard } from '../../lib/api/origin';
import { noopRateLimiter, setRateLimiter } from '../../lib/api/rate-limit';
import { setSessionResolver } from '../../lib/api/session';

const PREFIX = 'sdd-506-routes-';
const SECRET = 'sk-test-0000000000a91F'; // learny-test-only
const MODEL = 'gpt-qualification-demo';
const FIXED = new Date('2026-11-11T12:20:00Z');

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
  const user = await serviceDb().transaction((tx) => createTestUser(tx, { email }));
  return { userId: user.id, email };
}

async function createKey(user: User): Promise<string> {
  const ctx = createServiceContext({
    userId: user.userId,
    email: user.email,
    requestId: randomUUID(),
    clock: new TestClock(),
  });
  const created = await createCredential(ctx, {
    provider: 'openai',
    modelIds: [MODEL],
    apiKey: SECRET,
  });
  if (!created.ok) throw created.error;
  return created.value.id;
}

async function call(
  id: string,
  body: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  let answer = { status: 0, body: {} as Record<string, unknown> };
  await testApiHandler({
    appHandler: { POST },
    params: { id },
    url: `http://localhost/api/v1/me/ai/credentials/${id}/qualify`,
    test: async ({ fetch }) => {
      const response = await fetch({
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
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

describe('[SPEC-506] route de qualification', () => {
  it('EF-3, CA-1 — qualifie un modèle et ne renvoie ni clé ni chiffré', async () => {
    const user = await createUser('owner');
    const credentialId = await createKey(user);
    asUser(user);
    const answer = await call(credentialId, { modelId: MODEL });
    expect(answer.status).toBe(200);
    expect(answer.body).toMatchObject({
      credentialId,
      modelId: MODEL,
      provider: 'openai',
      status: 'qualified',
    });
    expect(answer.body.steps).toHaveLength(4);
    expect(answer.body.bricks).toHaveLength(13);
    const serialised = JSON.stringify(answer.body);
    expect(serialised).not.toContain('0000000000');
    expect(serialised).not.toContain('apiKey');
    expect(serialised).not.toContain('encryptedKey');
    expect(serialised).not.toContain('payload');
  });

  it('CA-3 — refuse la clé d’un autre utilisateur sans exposer la clé', async () => {
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    const credentialId = await createKey(alice);
    asUser(bob);
    const answer = await call(credentialId, { modelId: MODEL });
    expect(answer.status).toBe(404);
    expect(answer.body.code).toBe('CREDENTIAL_NOT_FOUND');
    expect(JSON.stringify(answer.body)).not.toContain('0000000000');
    expect(answer.body).not.toHaveProperty('steps');
    expect(answer.body).not.toHaveProperty('bricks');
  });

  it('EF-3 — un modèle absent de la clé répond 422 sans appel', async () => {
    const user = await createUser('wrong-model');
    const credentialId = await createKey(user);
    asUser(user);
    const answer = await call(credentialId, { modelId: 'not-registered' });
    expect(answer.status).toBe(422);
    expect(answer.body.code).toBe('VALIDATION_FAILED');
    expect(JSON.stringify(answer.body)).not.toContain('0000000000');
  });
});
