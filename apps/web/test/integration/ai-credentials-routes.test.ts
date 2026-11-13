// Integration tests of the personal-key routes (SPEC-505 EF-1 to EF-6, CA-3, CA-4, CA-6, CA-7,
// CL-6 to CL-9). The route wrapper runs for real (session, validation, idempotency, problem+json);
// only the rate limiter and the origin guard are replaced by their no-op implementations.
import { randomUUID } from 'node:crypto';

import { testApiHandler } from 'next-test-api-route-handler';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { createLogCapture, createLogger } from '@learny/core/server';
import { aiCredentials, aiTaskModels, closeDb, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { createServiceContext } from '@learny/services';
import { createCredential } from '@learny/services/ai/credentials';

import { DELETE } from '../../app/api/v1/me/ai/credentials/[id]/route';
import { GET, POST } from '../../app/api/v1/me/ai/credentials/route';
import { noopOriginGuard, setOriginGuard } from '../../lib/api/origin';
import { noopRateLimiter, setRateLimiter } from '../../lib/api/rate-limit';
import { setSessionResolver } from '../../lib/api/session';

const PREFIX = 'sdd-505-routes-';
const SECRET = 'sk-test-0000000000a91F'; // learny-test-only
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
  const userId = await serviceDb().transaction(
    async (tx) => (await createTestUser(tx, { email })).id,
  );
  return { userId, email };
}

interface ApiAnswer {
  status: number;
  body: Record<string, unknown>;
}

async function call(
  appHandler: Record<string, unknown>,
  options: {
    method?: string;
    id?: string;
    body?: unknown;
    idempotencyKey?: string | null;
    path?: string;
  } = {},
): Promise<ApiAnswer> {
  const id = options.id ?? '';
  const path = options.path ?? `/api/v1/me/ai/credentials${id === '' ? '' : `/${id}`}`;
  let answer: ApiAnswer = { status: 0, body: {} };
  await testApiHandler({
    appHandler,
    ...(id === '' ? {} : { params: { id } }),
    url: `http://localhost${path}`,
    test: async ({ fetch }) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (options.idempotencyKey !== null && options.idempotencyKey !== undefined) {
        headers['idempotency-key'] = options.idempotencyKey;
      }
      const response = await fetch({
        method: options.method ?? 'POST',
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

function openAiBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    provider: 'openai',
    modelIds: ['gpt-5-mini'],
    apiKey: SECRET,
    ...overrides,
  };
}

async function countCredentials(userId: string): Promise<number> {
  const rows = await serviceDb()
    .select({ id: aiCredentials.id })
    .from(aiCredentials)
    .where(sql`${aiCredentials.userId} = ${userId}::uuid`);
  return rows.length;
}

async function seedCredential(userId: string, index: number): Promise<string> {
  const id = randomUUID();
  await serviceDb()
    .insert(aiCredentials)
    .values({
      id,
      userId,
      provider: 'openai',
      label: `Clé ${String(index)}`,
      modelIds: ['gpt-seed'],
      encryptedKey: Buffer.alloc(32, index + 1),
      keyLast4: 'a91F',
      status: 'untested',
      qualification: {},
      outsideEu: true,
      qualifiedAt: null,
      createdAt: new Date(FIXED.getTime() + index),
      updatedAt: FIXED,
    });
  return id;
}

beforeAll(() => {
  setOriginGuard(noopOriginGuard);
  setRateLimiter(noopRateLimiter);
});

afterEach(() => {
  restoreSession();
  setOriginGuard(noopOriginGuard);
  setRateLimiter(noopRateLimiter);
  delete process.env.ALLOW_LOCAL_MODELS;
});

afterAll(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

describe('[SPEC-505] identifiants IA', () => {
  it('CA-3, CA-4 — crée puis liste une clé masquée, sans jamais renvoyer la clé', async () => {
    const user = await createUser('create');
    asUser(user);
    const created = await call(
      { POST },
      { body: openAiBody(), idempotencyKey: `create-${randomUUID().slice(0, 8)}` },
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      provider: 'openai',
      providerLabel: 'OpenAI',
      label: 'OpenAI',
      keyMasked: 'sk-••••••••a91F',
      status: 'untested',
      outsideEu: true,
      dataNote: 'Ce fournisseur traite les données hors de l’Union européenne.',
      baseUrl: null,
      modelIds: ['gpt-5-mini'],
      qualifiedAt: null,
    });
    expect(JSON.stringify(created.body)).not.toContain('0000000000');
    expect(JSON.stringify(created.body)).not.toContain(SECRET);
    expect(created.body).not.toHaveProperty('apiKey');
    expect(created.body).not.toHaveProperty('encryptedKey');

    const listed = await call({ GET }, { method: 'GET' });
    expect(listed.status).toBe(200);
    const items = listed.body.items as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(created.body.id);
    expect(JSON.stringify(listed.body)).not.toContain('0000000000');
  });

  it('CA-4 — masque une clé sans préfixe alphabétique', async () => {
    const user = await createUser('mask');
    asUser(user);
    const created = await call(
      { POST },
      {
        body: openAiBody({ apiKey: 'testkeyA7Kq2' }),
        idempotencyKey: `mask-${randomUUID().slice(0, 8)}`,
      },
    );
    expect(created.status).toBe(201);
    expect(created.body.keyMasked).toBe('••••••••7Kq2');
  });

  it('CL-7 — la même clé d’idempotence renvoie la même réponse et une seule ligne', async () => {
    const user = await createUser('idempotent');
    asUser(user);
    const key = `idem-${randomUUID().slice(0, 8)}`;
    const first = await call({ POST }, { body: openAiBody(), idempotencyKey: key });
    const second = await call({ POST }, { body: openAiBody(), idempotencyKey: key });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
    expect(await countCredentials(user.userId)).toBe(1);
  });

  it('EF-6 — un doublon exact répond 409 CONFLICT', async () => {
    const user = await createUser('duplicate');
    asUser(user);
    const first = await call(
      { POST },
      { body: openAiBody(), idempotencyKey: `dup1-${randomUUID().slice(0, 8)}` },
    );
    expect(first.status).toBe(201);
    const duplicate = await call(
      { POST },
      { body: openAiBody(), idempotencyKey: `dup2-${randomUUID().slice(0, 8)}` },
    );
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe('CONFLICT');
    expect(duplicate.body.detail).toBe('Cette clé est déjà enregistrée.');
  });

  it('CA-6 — les validations renvoient 422 avec le champ en erreur', async () => {
    const user = await createUser('validation');
    asUser(user);
    const cases: { label: string; body: Record<string, unknown>; code?: string; path?: string }[] =
      [
        { label: 'fournisseur inconnu', body: openAiBody({ provider: 'unknown' }) },
        { label: 'aucun modèle', body: openAiBody({ modelIds: [] }) },
        { label: 'modèle interdit', body: openAiBody({ modelIds: ['gpt 5'] }) },
        { label: 'modèles dupliqués', body: openAiBody({ modelIds: ['gpt-5', 'gpt-5'] }) },
        { label: 'clé absente', body: openAiBody({ apiKey: undefined }) },
        { label: 'clé trop courte', body: openAiBody({ apiKey: 'short' }) },
        { label: 'clé avec blanc', body: openAiBody({ apiKey: 'sk-test value 1234' }) },
        { label: 'adresse refusée', body: openAiBody({ baseUrl: 'https://api.example.com' }) },
        {
          label: 'adresse manquante',
          body: { provider: 'openai_compatible', modelIds: ['m'], apiKey: SECRET },
        },
        {
          label: 'adresse métadonnées',
          body: {
            provider: 'openai_compatible',
            modelIds: ['m'],
            apiKey: SECRET,
            baseUrl: 'https://169.254.169.254/v1',
          },
          code: 'URL_BLOCKED_HOST',
        },
        {
          label: 'adresse locale',
          body: {
            provider: 'openai_compatible',
            modelIds: ['m'],
            apiKey: SECRET,
            baseUrl: 'https://localhost/v1',
          },
          code: 'URL_BLOCKED_HOST',
        },
        {
          label: 'modèles locaux désactivés',
          body: { provider: 'local', modelIds: ['llama'], baseUrl: 'http://localhost:11434' },
          code: 'LOCAL_MODELS_DISABLED',
        },
      ];
    for (const testCase of cases) {
      const answer = await call(
        { POST },
        {
          body: testCase.body,
          idempotencyKey: `validation-${randomUUID().slice(0, 8)}`,
        },
      );
      expect(answer.status, testCase.label).toBe(422);
      if (testCase.code !== undefined) {
        expect(answer.body.code, testCase.label).toBe(testCase.code);
      } else {
        expect(answer.body.code, testCase.label).toBe('VALIDATION_FAILED');
        expect(Array.isArray(answer.body.errors), testCase.label).toBe(true);
      }
    }
  });

  it('CA-6 — sans Idempotency-Key, la création répond 400', async () => {
    const user = await createUser('no-idem');
    asUser(user);
    const answer = await call({ POST }, { body: openAiBody(), idempotencyKey: null });
    expect(answer.status).toBe(400);
    expect(answer.body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
  });

  it('CA-6 — le onzième identifiant répond CREDENTIAL_LIMIT_REACHED', async () => {
    const user = await createUser('limit');
    for (let index = 0; index < 10; index += 1) {
      await seedCredential(user.userId, index);
    }
    asUser(user);
    const answer = await call(
      { POST },
      { body: openAiBody(), idempotencyKey: `limit-${randomUUID().slice(0, 8)}` },
    );
    expect(answer.status).toBe(422);
    expect(answer.body.code).toBe('CREDENTIAL_LIMIT_REACHED');
    expect(answer.body.detail).toBe(
      'Vous avez atteint 10 fournisseurs enregistrés. Supprimez-en un pour en ajouter un autre.',
    );
  });

  it('EF-5 — un modèle local est accepté seulement avec ALLOW_LOCAL_MODELS=true', async () => {
    const user = await createUser('local');
    asUser(user);
    process.env.ALLOW_LOCAL_MODELS = 'true';
    const created = await call(
      { POST },
      {
        body: {
          provider: 'local',
          modelIds: ['llama3.2:3b'],
          baseUrl: 'http://localhost:11434/v1',
        },
        idempotencyKey: `local-${randomUUID().slice(0, 8)}`,
      },
    );
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      provider: 'local',
      keyMasked: null,
      outsideEu: false,
      baseUrl: 'http://localhost:11434/v1',
    });
  });

  it('CA-7, CL-8 — un autre utilisateur ne liste ni ne supprime la clé', async () => {
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    asUser(alice);
    const created = await call(
      { POST },
      { body: openAiBody(), idempotencyKey: `alice-${randomUUID().slice(0, 8)}` },
    );
    expect(created.status).toBe(201);
    const id = created.body.id as string;

    asUser(bob);
    const listed = await call({ GET }, { method: 'GET' });
    expect(listed.status).toBe(200);
    expect(listed.body.items).toEqual([]);
    const removed = await call({ DELETE }, { method: 'DELETE', id });
    expect(removed.status).toBe(404);

    asUser(alice);
    const stillThere = await call({ GET }, { method: 'GET' });
    expect((stillThere.body.items as unknown[]).length).toBe(1);
  });

  it('CL-6 — la suppression retire les affectations de tâches puis la clé', async () => {
    const user = await createUser('delete');
    asUser(user);
    const created = await call(
      { POST },
      { body: openAiBody(), idempotencyKey: `delete-${randomUUID().slice(0, 8)}` },
    );
    const id = created.body.id as string;
    await serviceDb()
      .insert(aiTaskModels)
      .values([
        { userId: user.userId, task: 'tutor', credentialId: id, modelId: 'gpt-5-mini' },
        { userId: user.userId, task: 'light', credentialId: id, modelId: 'gpt-5-mini' },
      ]);
    const removed = await call({ DELETE }, { method: 'DELETE', id });
    expect(removed.status).toBe(204);
    expect(await countCredentials(user.userId)).toBe(0);
    const assignments = await serviceDb()
      .select({ userId: aiTaskModels.userId })
      .from(aiTaskModels)
      .where(sql`${aiTaskModels.credentialId} = ${id}::uuid`);
    expect(assignments).toEqual([]);
  });

  it('CA-3, CL-9 — le journal du service ne contient jamais la clé', async () => {
    const user = await createUser('logs');
    const capture = createLogCapture();
    const logger = createLogger({
      route: 'test.credentials',
      requestId: randomUUID(),
      destination: capture.destination,
      clock: new TestClock(),
    });
    const ctx = createServiceContext({
      userId: user.userId,
      email: user.email,
      requestId: randomUUID(),
      logger,
      clock: new TestClock(),
    });
    const created = await createCredential(ctx, {
      provider: 'openai',
      modelIds: ['gpt-5-mini'],
      apiKey: SECRET,
    });
    expect(created.ok).toBe(true);
    expect(capture.text()).not.toContain('0000000000');
    expect(capture.text()).not.toContain(SECRET);
    const duplicate = await createCredential(ctx, {
      provider: 'openai',
      modelIds: ['gpt-5-mini'],
      apiKey: SECRET,
    });
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok) {
      expect(JSON.stringify(duplicate.error)).not.toContain(SECRET);
      expect(duplicate.error.stack ?? '').not.toContain(SECRET);
    }
    expect(capture.text()).not.toContain(SECRET);
  });
});
