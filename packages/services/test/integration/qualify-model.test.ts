// Integration of the personal-model qualification (SPEC-506 CA-1 to CA-4, CL-1, CL-4).
// Postgres is real: RLS, the per-model report, task assignment and notifications are exercised.
// The provider is the committed simulated model; no key and no external call enters the test.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import {
  aiCalls,
  aiCredentials,
  aiTaskModels,
  closeDb,
  notifications,
  serviceDb,
  sql,
  upsertSubscription,
} from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { resolveModel } from '@learny/llm';
import { createCredential } from '@learny/services/ai/credentials';
import {
  assignTaskModel,
  qualifyCredential,
  stopAfterInvalidBrick,
} from '@learny/services/ai/qualify';

import { createServiceContext, type ServiceContext } from '../../src/context';

const PREFIX = 'sdd-506-';
const FIXED = new Date('2026-11-11T12:20:00Z');
const FUTURE = new Date('2026-12-11T12:20:00Z');
const MODEL = 'gpt-qualification-demo';
const SECRET = 'sk-test-506-00000000a91F'; // learny-test-only

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

async function createUser(
  label: string,
): Promise<{ userId: string; email: string; ctx: ServiceContext }> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const user = await serviceDb().transaction((tx) => createTestUser(tx, { email }));
  return {
    userId: user.id,
    email,
    ctx: createServiceContext({
      userId: user.id,
      email,
      requestId: randomUUID(),
      clock: new TestClock(),
    }),
  };
}

async function createKey(ctx: ServiceContext, modelIds: string[] = [MODEL]): Promise<string> {
  const created = await createCredential(ctx, {
    provider: 'openai',
    modelIds,
    apiKey: SECRET,
  });
  if (!created.ok) throw created.error;
  return created.value.id;
}

async function cleanup(): Promise<void> {
  await serviceDb().execute(sql`delete from auth.users where email like ${`${PREFIX}%`}`);
}

async function rowOf(id: string) {
  const rows = await serviceDb()
    .select({
      status: aiCredentials.status,
      qualifiedAt: aiCredentials.qualifiedAt,
      qualification: aiCredentials.qualification,
    })
    .from(aiCredentials)
    .where(sql`${aiCredentials.id} = ${id}::uuid`);
  return rows[0];
}

async function callCount(userId: string): Promise<number> {
  const rows = await serviceDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(aiCalls)
    .where(sql`${aiCalls.userId} = ${userId}::uuid`);
  return rows[0]?.count ?? 0;
}

beforeAll(cleanup);
afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe('[SPEC-506] service', () => {
  it('CA-1, CA-2 — qualifie, persiste, affecte, puis une brique invalide bloque le modèle', async () => {
    const { userId, ctx } = await createUser('success');
    const credentialId = await createKey(ctx);
    const qualified = await qualifyCredential(ctx, credentialId, MODEL, {
      mockScenario: 'qualification-success',
    });
    expect(qualified.ok).toBe(true);
    if (!qualified.ok) return;
    expect(qualified.value.status).toBe('qualified');
    expect(qualified.value.steps).toHaveLength(4);
    expect(qualified.value.bricks).toHaveLength(13);
    expect(qualified.value.bricks.every((brick) => brick.status === 'passed')).toBe(true);
    expect(qualified.value.capabilities).toMatchObject({
      tools: true,
      structured: true,
      passage_refs: true,
    });
    expect(JSON.stringify(qualified.value)).not.toContain('0000000000');

    const row = await rowOf(credentialId);
    expect(row?.status).toBe('qualified');
    expect(row?.qualifiedAt?.toISOString()).toBe(FIXED.toISOString());
    expect(row?.qualification.keyFingerprint).toBeTypeOf('string');

    const assignment = await assignTaskModel(ctx, {
      task: 'tutor',
      credentialId,
      modelId: MODEL,
    });
    expect(assignment.ok).toBe(true);
    const resolved = await resolveModel(serviceDb(), { userId, task: 'tutor' });
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.value).toMatchObject({
        kind: 'byok',
        credentialId,
        modelId: MODEL,
      });
    }

    const failed = await qualifyCredential(ctx, credentialId, MODEL, {
      mockScenario: 'qualification-invalid-brick',
    });
    expect(failed.ok).toBe(true);
    if (!failed.ok) return;
    expect(failed.value.status).toBe('failed');
    expect(failed.value.bricks.filter((brick) => brick.status === 'failed')).toHaveLength(1);
    expect(failed.value.bricks.filter((brick) => brick.status === 'passed')).toHaveLength(12);
    const after = await rowOf(credentialId);
    expect(after?.status).toBe('failed');
    expect(after?.qualifiedAt).toBeNull();
    expect(after?.qualification.models).toBeTypeOf('object');

    const blocked = await assignTaskModel(ctx, {
      task: 'gaps',
      credentialId,
      modelId: MODEL,
    });
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.error.code).toBe('AI_MODEL_NOT_QUALIFIED');
    const unavailable = await resolveModel(serviceDb(), { userId, task: 'tutor' });
    expect(unavailable.ok).toBe(false);
    if (!unavailable.ok) {
      expect(unavailable.error.code).toBe('AI_UNAVAILABLE');
      expect(unavailable.error.reason).toBe('credential_not_qualified');
    }
    expect(await callCount(userId)).toBe(32);
  });

  it('CA-3 — la clé d’un autre utilisateur est invisible et aucun octet de clé n’est renvoyé', async () => {
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    const credentialId = await createKey(alice.ctx);

    const attempt = await qualifyCredential(bob.ctx, credentialId, MODEL, {
      mockScenario: 'qualification-success',
    });
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) {
      expect(attempt.error.code).toBe('CREDENTIAL_NOT_FOUND');
      expect(JSON.stringify(attempt.error)).not.toContain('0000000000');
      expect(attempt.error.stack ?? '').not.toContain(SECRET);
    }
    const row = await rowOf(credentialId);
    expect(row?.status).toBe('untested');
    expect(JSON.stringify(row?.qualification)).not.toContain('0000000000');
  });

  it('CL-1 — une clé supprimée pendant la batterie répond CREDENTIAL_NOT_FOUND', async () => {
    const { ctx } = await createUser('deleted');
    const credentialId = await createKey(ctx);
    const removed = await serviceDb().execute(
      sql`delete from public.ai_credentials where id = ${credentialId}::uuid`,
    );
    expect(removed.length).toBeGreaterThanOrEqual(0);
    const attempt = await qualifyCredential(ctx, credentialId, MODEL);
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.error.code).toBe('CREDENTIAL_NOT_FOUND');
  });

  it('CL-4 — deux qualifications concurrentes partagent une seule exécution', async () => {
    const { userId, ctx } = await createUser('concurrent');
    const credentialId = await createKey(ctx);
    const [left, right] = await Promise.all([
      qualifyCredential(ctx, credentialId, MODEL, { mockScenario: 'qualification-success' }),
      qualifyCredential(ctx, credentialId, MODEL, { mockScenario: 'qualification-success' }),
    ]);
    expect(left.ok && right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    expect(left.value.id).toBe(right.value.id);
    expect(await callCount(userId)).toBe(16);
    const rows = await serviceDb()
      .select({ id: aiTaskModels.credentialId })
      .from(aiTaskModels)
      .where(sql`${aiTaskModels.userId} = ${userId}::uuid`);
    expect(rows).toEqual([]);
  });

  it('CA-4 — après deux corrections, la tâche s’arrête sans appel à l’IA fournie', async () => {
    const { userId, ctx } = await createUser('invalid-output');
    await serviceDb().transaction((tx) =>
      upsertSubscription(tx, { userId, status: 'active', currentPeriodEnd: FUTURE }),
    );
    const stopped = await stopAfterInvalidBrick(ctx, {
      task: 'tutor',
      modelId: MODEL,
      attempts: 2,
    });
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) return;
    expect(stopped.value).toMatchObject({
      status: 'stopped',
      errorCode: 'INVALID_OUTPUT',
      attempts: 2,
      managedCalls: 0,
      notified: true,
    });
    if (stopped.value.status === 'stopped') {
      expect(stopped.value.choices).toEqual(['personal_model', 'managed_ai']);
    }
    expect(await callCount(userId)).toBe(0);
    const rows = await serviceDb()
      .select({ type: notifications.type, dedupeKey: notifications.dedupeKey })
      .from(notifications)
      .where(sql`${notifications.userId} = ${userId}::uuid`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ type: 'ai_task_failed' });
    expect(rows[0]?.dedupeKey).toBe(`ai_task_failed:tutor:${MODEL}:2026-11-11`);

    const retry = await stopAfterInvalidBrick(ctx, {
      task: 'tutor',
      modelId: MODEL,
      attempts: 1,
    });
    expect(retry).toEqual({ ok: true, value: { status: 'retry', attempts: 1, remaining: 1 } });
  });

  it('CA-4 — sans abonnement, seule l’autre clé personnelle est proposée', async () => {
    const { ctx } = await createUser('no-sub');
    const stopped = await stopAfterInvalidBrick(ctx, {
      task: 'gaps',
      modelId: MODEL,
      attempts: 2,
    });
    expect(stopped.ok).toBe(true);
    if (!stopped.ok) return;
    if (stopped.value.status === 'stopped') {
      expect(stopped.value.choices).toEqual(['personal_model']);
      expect(stopped.value.managedCalls).toBe(0);
    }
  });

  it('EF-4 — un modèle non enregistré sur la clé est refusé avant tout appel', async () => {
    const { userId, ctx } = await createUser('outside');
    const credentialId = await createKey(ctx, ['gpt-allowed']);
    const attempt = await qualifyCredential(ctx, credentialId, 'gpt-other');
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.error.code).toBe('VALIDATION_FAILED');
    expect(await callCount(userId)).toBe(0);
  });
});
