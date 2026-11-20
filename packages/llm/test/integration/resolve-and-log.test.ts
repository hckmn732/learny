// Integration of the LLM package (SPEC-504 CA-1, CA-5, CL-1 to CL-3).
// Postgres is real; Anthropic is MSW for the BYOK failures. Every mock session runs without any
// network call; the journal rows are read from the real `ai_calls` table.
import { randomUUID } from 'node:crypto';

import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { closeDb, serviceDb, sql } from '@learny/db';
import {
  createCredential,
  setTaskModel,
  upsertSubscription,
  listAiCalls,
} from '@learny/db';
import { createTestUser } from '@learny/db/testing';

import {
  createSession,
  resolveModel,
  type ResolvedModel,
} from '../../src/index';

const PREFIX = 'sdd-504-';
const FUTURE = new Date('2026-12-11T12:20:00.000Z');
const TASKS = ['programme', 'course', 'gaps', 'tutor', 'light'] as const;
const KEY = new Uint8Array(29).fill(7);

async function user(label: string): Promise<string> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => (await createTestUser(tx, { email })).id);
}

async function subscriber(label: string): Promise<string> {
  const id = await user(label);
  await serviceDb().transaction((tx) =>
    upsertSubscription(tx, { userId: id, status: 'active', currentPeriodEnd: FUTURE }),
  );
  return id;
}

async function personalKey(
  userId: string,
  options: {
    status?: 'qualified' | 'failed' | 'untested';
    modelIds?: string[];
    provider?: 'openai' | 'anthropic';
  } = {},
): Promise<string> {
  return serviceDb().transaction(async (tx) => {
    const credential = await createCredential(tx, {
      userId,
      provider: options.provider ?? 'openai',
      label: 'Clé de test',
      baseUrl: 'https://api.openai.com/v1',
      modelIds: options.modelIds ?? ['gpt-test'],
      encryptedKey: KEY,
      keyLast4: 'abcd',
      status: options.status ?? 'qualified',
      qualifiedAt: options.status === 'failed' ? null : FUTURE,
    });
    return credential.id;
  });
}

async function choose(
  userId: string,
  task: (typeof TASKS)[number],
  modelId: string,
  credentialId: string | null,
): Promise<void> {
  await serviceDb().transaction((tx) => setTaskModel(tx, { userId, task, credentialId, modelId }));
}

/** A learner who chose the same qualified personal model for every task. */
async function withModels(label: string): Promise<string> {
  const id = await user(label);
  const credentialId = await personalKey(id);
  for (const task of TASKS) await choose(id, task, 'gpt-test', credentialId);
  return id;
}

async function model(
  userId: string,
  task: (typeof TASKS)[number] = 'tutor',
): Promise<ResolvedModel> {
  const result = await resolveModel(serviceDb(), { userId, task });
  if (!result.ok) throw result.error;
  return result.value;
}

async function unavailable(userId: string, task: (typeof TASKS)[number] = 'tutor') {
  const result = await resolveModel(serviceDb(), { userId, task });
  if (result.ok) throw new Error('AI_UNAVAILABLE attendu');
  return result.error;
}

async function calls(userId: string) {
  return listAiCalls(serviceDb() as never, { userId, limit: 20 });
}

const server = setupServer();

beforeAll(() => {
  server.listen();
});
afterAll(async () => {
  server.close();
  await closeDb();
});
beforeEach(async () => {
  await serviceDb().execute(sql`delete from auth.users where email like ${`${PREFIX}%`}`);
});
afterEach(async () => {
  await serviceDb().execute(sql`delete from auth.users where email like ${`${PREFIX}%`}`);
});

describe('[SPEC-504] résolution et journal', () => {
  it('CA-1 — aucun modèle par défaut : sans choix, AI_UNAVAILABLE no_model_selected', async () => {
    const userId = await user('no-choice');
    for (const task of TASKS) {
      const error = await unavailable(userId, task);
      expect(error.code).toBe('AI_UNAVAILABLE');
      expect(error.reason).toBe('no_model_selected');
    }
  });

  it('CA-1 — un abonnement actif ne fournit aucun modèle : sans choix, no_model_selected', async () => {
    const userId = await subscriber('subscribed-no-choice');
    const error = await unavailable(userId);
    expect(error.code).toBe('AI_UNAVAILABLE');
    expect(error.reason).toBe('no_model_selected');
  });

  it('CA-1 — non abonné avec clé qualifiée : modèle personnel', async () => {
    const userId = await user('byok');
    const credentialId = await personalKey(userId);
    await choose(userId, 'tutor', 'gpt-test', credentialId);
    const resolved = await model(userId, 'tutor');
    expect(resolved).toMatchObject({
      kind: 'byok',
      provider: 'openai',
      modelId: 'gpt-test',
      credentialId,
      outsideEu: false,
    });
  });

  it('CA-1 — non abonné avec clé non qualifiée : AI_UNAVAILABLE', async () => {
    const userId = await user('unqualified');
    const credentialId = await personalKey(userId, { status: 'failed' });
    await choose(userId, 'tutor', 'gpt-test', credentialId);
    const error = await unavailable(userId);
    expect(error.code).toBe('AI_UNAVAILABLE');
    expect(error.reason).toBe('credential_not_qualified');
    expect(error.credentialId).toBe(credentialId);
  });

  it('CA-1, SPEC-709 CL-3 — abonné avec clé devenue non qualifiée : AI_UNAVAILABLE, sans bascule payante', async () => {
    const userId = await subscriber('sub-unqualified');
    const credentialId = await personalKey(userId, { status: 'untested' });
    await choose(userId, 'tutor', 'gpt-test', credentialId);
    const error = await unavailable(userId);
    expect(error.code).toBe('AI_UNAVAILABLE');
    expect(error.reason).toBe('credential_not_qualified');
    expect(error.credentialId).toBe(credentialId);
  });

  it('CA-1 — clé supprimée (credential_id nul) : AI_UNAVAILABLE sans abonnement', async () => {
    const userId = await user('deleted');
    await choose(userId, 'tutor', 'gpt-deleted', null);
    const error = await unavailable(userId);
    expect(error.code).toBe('AI_UNAVAILABLE');
    expect(error.reason).toBe('credential_not_qualified');
  });

  it('CA-1 — modèle hors model_ids : aucun modèle personnel utilisé', async () => {
    const userId = await user('outside');
    const credentialId = await personalKey(userId, { modelIds: ['gpt-allowed'] });
    await choose(userId, 'tutor', 'gpt-other', credentialId);
    const error = await unavailable(userId);
    expect(error.reason).toBe('credential_not_qualified');
  });

  it('CA-5 — session mock : une ligne ok avec tokens et latence de la fixture', async () => {
    const userId = await withModels('session');
    const session = await createSession(
      { userId, db: serviceDb() },
      { task: 'tutor', promptId: 'tutor.demo', mock: { scenario: 'demo' } },
    );
    expect(session.ok).toBe(true);
    if (!session.ok) return;
    const step = await session.value.step({
      system: [{ text: 'Tu es un tuteur.', cache: true }],
      messages: [{ role: 'user', content: 'Bonjour' }],
    });
    expect(step.ok).toBe(true);
    if (!step.ok) return;
    expect(step.value.text).toBe('Bonjour !');
    const rows = await calls(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      task: 'tutor',
      provider: 'openai',
      model: 'gpt-test',
      managed: false,
      inputTokens: 24,
      outputTokens: 4,
      latencyMs: 120,
      status: 'ok',
      errorCode: null,
      batch: false,
    });
  });

  it('CA-5 — refus : une ligne refused et AI_REFUSED', async () => {
    const userId = await withModels('refusal');
    const session = await createSession(
      { userId, db: serviceDb() },
      { task: 'tutor', promptId: 'tutor.demo', mock: { scenario: 'demo-refusal' } },
    );
    if (!session.ok) throw session.error;
    const step = await session.value.step({
      system: [],
      messages: [{ role: 'user', content: 'Question' }],
    });
    expect(step.ok).toBe(false);
    if (!step.ok) expect(step.error.code).toBe('AI_REFUSED');
    const rows = await calls(userId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ status: 'refused', errorCode: 'AI_REFUSED' });
  });

  it('CA-5 — sortie structurée invalide : INVALID_OUTPUT journalisé', async () => {
    const userId = await withModels('invalid');
    const session = await createSession(
      { userId, db: serviceDb() },
      { task: 'light', promptId: 'light.demo-object', mock: { scenario: 'demo-invalid-object' } },
    );
    if (!session.ok) throw session.error;
    const object = await session.value.object({
      system: [],
      messages: [{ role: 'user', content: 'Titre' }],
      schema: z.object({ title: z.string(), confidence: z.number() }),
    });
    expect(object.ok).toBe(false);
    if (!object.ok) expect(object.error.code).toBe('INVALID_OUTPUT');
    const rows = await calls(userId);
    expect(rows[0]).toMatchObject({ status: 'invalid_output', errorCode: 'INVALID_OUTPUT' });
  });

  it('CL-1 — AI_UNAVAILABLE ne crée aucune ligne ai_calls', async () => {
    const userId = await user('no-call');
    const session = await createSession(
      { userId, db: serviceDb() },
      { task: 'tutor', promptId: 'tutor.demo' },
    );
    expect(session.ok).toBe(false);
    if (!session.ok) expect(session.error.code).toBe('AI_UNAVAILABLE');
    expect(await calls(userId)).toHaveLength(0);
  });

  it('CL-2 — 401 Anthropic sur clé personnelle : AI_KEY_INVALID journalisé', async () => {
    const userId = await user('auth');
    const credentialId = await personalKey(userId, {
      provider: 'anthropic',
      modelIds: ['test-model'],
    });
    await choose(userId, 'tutor', 'test-model', credentialId);
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () =>
        HttpResponse.json({ error: { message: 'invalid key' } }, { status: 401 }),
      ),
    );
    const session = await createSession(
      { userId, db: serviceDb() },
      {
        task: 'tutor',
        promptId: 'tutor.demo',
        mode: 'live',
        secrets: { apiKey: 'sk-ant-invalid' },
      },
    );
    if (!session.ok) throw session.error;
    const step = await session.value.step({
      system: [],
      messages: [{ role: 'user', content: 'Bonjour' }],
      abortSignal: AbortSignal.timeout(5_000),
    });
    expect(step.ok).toBe(false);
    if (!step.ok) {
      expect(step.error.code).toBe('AI_KEY_INVALID');
      expect(step.error.credentialId).toBe(credentialId);
    }
    const rows = await calls(userId);
    expect(rows[0]).toMatchObject({ status: 'error', errorCode: 'AI_KEY_INVALID' });
  });

  it('CL-2 — 529 Anthropic : AI_PROVIDER_ERROR après les réessais', async () => {
    const userId = await user('server');
    const credentialId = await personalKey(userId, {
      provider: 'anthropic',
      modelIds: ['test-model'],
    });
    await choose(userId, 'tutor', 'test-model', credentialId);
    let attempts = 0;
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () => {
        attempts += 1;
        return HttpResponse.json({ error: { message: 'overloaded' } }, { status: 529 });
      }),
    );
    const session = await createSession(
      { userId, db: serviceDb() },
      {
        task: 'tutor',
        promptId: 'tutor.demo',
        mode: 'live',
        secrets: { apiKey: 'sk-ant-test' },
      },
    );
    if (!session.ok) throw session.error;
    const step = await session.value.step({
      system: [],
      messages: [{ role: 'user', content: 'Bonjour' }],
      abortSignal: AbortSignal.timeout(30_000),
    });
    expect(step.ok).toBe(false);
    if (!step.ok) expect(step.error.code).toBe('AI_PROVIDER_ERROR');
    expect(attempts).toBe(3);
    expect((await calls(userId))[0]).toMatchObject({
      status: 'error',
      errorCode: 'AI_PROVIDER_ERROR',
    });
  });

  it('CL-3 — stop_reason refusal Anthropic : AI_REFUSED et statut refused', async () => {
    const userId = await user('provider-refusal');
    const credentialId = await personalKey(userId, {
      provider: 'anthropic',
      modelIds: ['test-model'],
    });
    await choose(userId, 'tutor', 'test-model', credentialId);
    server.use(
      http.post('https://api.anthropic.com/v1/messages', () =>
        HttpResponse.json({
          id: 'msg_refusal',
          type: 'message',
          role: 'assistant',
          model: 'test-model',
          content: [],
          stop_reason: 'refusal',
          stop_sequence: null,
          usage: { input_tokens: 10, output_tokens: 0 },
        }),
      ),
    );
    const session = await createSession(
      { userId, db: serviceDb() },
      {
        task: 'tutor',
        promptId: 'tutor.demo',
        mode: 'live',
        secrets: { apiKey: 'sk-ant-test' },
      },
    );
    if (!session.ok) throw session.error;
    const step = await session.value.step({
      system: [],
      messages: [{ role: 'user', content: 'Bonjour' }],
      abortSignal: AbortSignal.timeout(5_000),
    });
    expect(step.ok).toBe(false);
    if (!step.ok) expect(step.error.code).toBe('AI_REFUSED');
    expect((await calls(userId))[0]).toMatchObject({
      status: 'refused',
      errorCode: 'AI_REFUSED',
    });
  });
});
