// Integration tests of the « Modèles d'IA » tab (SPEC-709 §12, CA-1 to CA-3, CL-3 to CL-5).
//
// Real Postgres with RLS (Supabase local). Keys are created and qualified through the public
// services of SPEC-505/SPEC-506 with the simulated battery (LLM_MODE=mock, ADR-0048); no provider
// is called. The clock is frozen at 2026-11-11T12:20:00Z (ADR-0047). Users are created by factory
// with the `sdd-709-` prefix and deleted in afterEach, cascade included.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import {
  aiCredentials,
  aiTaskModels,
  closeDb,
  serviceDb,
  sql,
  upsertSubscription,
} from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import { resolveModel } from '@learny/llm';
import { createCredential, deleteCredential } from '@learny/services/ai/credentials';
import { qualifyCredential } from '@learny/services/ai/qualify';

import { createServiceContext, type ServiceContext } from '../../src/context';
import { getAiModelsState, updateAiModels } from '../../src/parametres-modeles-d-ia';

const PREFIX = 'sdd-709-';
const FIXED = new Date('2026-11-11T12:20:00Z');
const FUTURE = new Date('2026-12-11T12:20:00Z');
const QUALIFIED_MODEL = 'claude-personal-709';
const SECRET = 'sk-test-709-000000a91F'; // learny-test-only

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

interface TestUser {
  userId: string;
  email: string;
  ctx: ServiceContext;
}

const createdUsers: string[] = [];

async function createUser(label: string): Promise<TestUser> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const user = await serviceDb().transaction((tx) => createTestUser(tx, { email }));
  createdUsers.push(user.id);
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

async function createKey(
  user: TestUser,
  modelIds: string[] = [QUALIFIED_MODEL],
  secret: string = SECRET,
): Promise<string> {
  const created = await createCredential(user.ctx, {
    provider: 'anthropic',
    modelIds,
    apiKey: secret,
  });
  if (!created.ok) throw created.error;
  return created.value.id;
}

async function qualify(
  user: TestUser,
  credentialId: string,
  scenario: 'qualification-success' | 'qualification-invalid-brick' = 'qualification-success',
): Promise<void> {
  const result = await qualifyCredential(user.ctx, credentialId, QUALIFIED_MODEL, {
    mockScenario: scenario,
  });
  if (!result.ok) throw result.error;
}

async function cleanup(): Promise<void> {
  if (createdUsers.length === 0) return;
  await serviceDb().execute(
    sql`delete from auth.users where id = any(${sql.raw(`array[${createdUsers.map((id) => `'${id}'::uuid`).join(',')}]`)})`,
  );
  createdUsers.length = 0;
}

async function assignmentCount(userId: string): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(sql`
    select count(*)::int as count from public.ai_task_models where user_id = ${userId}::uuid
  `);
  return rows[0]?.count ?? 0;
}

beforeEach(() => {
  createdUsers.length = 0;
});

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe('[SPEC-709] service et API', () => {
  it('CA-1 — un modèle failed n’est pas proposé, un modèle qualifié s’affecte puis se réinitialise', async () => {
    const user = await createUser('ca1');
    const failedKey = await createKey(user, ['failed-709'], 'sk-test-709-111111a91F');
    const failed = await qualifyCredential(user.ctx, failedKey, 'failed-709', {
      mockScenario: 'qualification-invalid-brick',
    });
    expect(failed.ok).toBe(true);
    if (!failed.ok) return;
    expect(failed.value.status).toBe('failed');

    // CA-1 — the failed model of the failed key never enters the five selectors.
    const afterFailure = await getAiModelsState(user.ctx);
    expect(afterFailure.ok).toBe(true);
    if (!afterFailure.ok) return;
    for (const task of afterFailure.value.tasks) {
      expect(task.options.some((option) => option.modelId === 'failed-709')).toBe(false);
    }
    const failedCard = afterFailure.value.providers.find((card) => card.id === failedKey);
    expect(failedCard).toMatchObject({ status: 'unqualified' });
    expect(failedCard?.failure?.step).toBe('bricks');
    expect(failedCard?.failure?.brickType).toBeTypeOf('string');

    // A qualified key is proposed, then assigned and shown as « Personnalisé ».
    const goodKey = await createKey(user);
    await qualify(user, goodKey);
    const assigned = await updateAiModels(user.ctx, {
      action: 'assign',
      task: 'tutor',
      credentialId: goodKey,
      modelId: QUALIFIED_MODEL,
    });
    expect(assigned.ok).toBe(true);
    if (!assigned.ok) return;
    const tutor = assigned.value.tasks.find((task) => task.task === 'tutor');
    expect(tutor).toMatchObject({
      selection: 'custom',
      origin: 'personal',
      credentialId: goodKey,
      modelId: QUALIFIED_MODEL,
      outsideEu: true,
      available: true,
    });
    expect(await assignmentCount(user.userId)).toBe(1);

    // EF-2 — the reset removes the choice and keeps both credentials and their qualification.
    const reset = await updateAiModels(user.ctx, { action: 'reset' });
    expect(reset.ok).toBe(true);
    if (!reset.ok) return;
    expect(reset.value.tasks.every((task) => task.selection === 'default')).toBe(true);
    expect(await assignmentCount(user.userId)).toBe(0);
    const keys = await serviceDb()
      .select({ id: aiCredentials.id, status: aiCredentials.status })
      .from(aiCredentials)
      .where(sql`${aiCredentials.userId} = ${user.userId}::uuid`);
    expect(keys).toHaveLength(2);
    expect(keys.filter((key) => key.status === 'qualified')).toHaveLength(1);
  });

  it('CA-2, CA-3 — la carte est masquée et les données d’un autre apprenant restent invisibles', async () => {
    const alice = await createUser('alice');
    const bob = await createUser('bob');
    const credentialId = await createKey(alice);
    await qualify(alice, credentialId);

    const state = await getAiModelsState(alice.ctx);
    expect(state.ok).toBe(true);
    if (!state.ok) return;
    const card = state.value.providers.find((entry) => entry.id === credentialId);
    // BR-IA-03 — only the mask and the four last characters cross the boundary.
    expect(card?.keyMasked).toBe('sk-••••••••a91F');
    expect(JSON.stringify(state.value)).not.toContain(SECRET);
    // BR-IA-04 — the card carries the outside-EU flag and note.
    expect(card).toMatchObject({ outsideEu: true, status: 'qualified' });

    // CA-3 — Bob cannot see nor assign Alice's key: 404, no write, no existence leak.
    const foreign = await updateAiModels(bob.ctx, {
      action: 'assign',
      task: 'tutor',
      credentialId,
      modelId: QUALIFIED_MODEL,
    });
    expect(foreign).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } });
    expect(await assignmentCount(bob.userId)).toBe(0);
    const bobState = await getAiModelsState(bob.ctx);
    expect(bobState.ok).toBe(true);
    if (!bobState.ok) return;
    expect(bobState.value.providers).toHaveLength(1);
    expect(JSON.stringify(bobState.value)).not.toContain(alice.userId);

    // CL-1 — an invalid body writes nothing.
    const invalid = await updateAiModels(bob.ctx, {
      action: 'assign',
      task: 'tutor',
      modelId: '',
    });
    expect(invalid).toMatchObject({ ok: false, error: { code: 'VALIDATION_FAILED', status: 400 } });
    expect(await assignmentCount(bob.userId)).toBe(0);
  });

  it('CA-3, CL-2 — deux demandes identiques ne dupliquent ni écriture ni événement', async () => {
    const user = await createUser('idempotent');
    const credentialId = await createKey(user);
    await qualify(user, credentialId);
    const body = {
      action: 'assign' as const,
      task: 'tutor' as const,
      credentialId,
      modelId: QUALIFIED_MODEL,
    };

    const first = await updateAiModels(user.ctx, body);
    const second = await updateAiModels(user.ctx, body);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    // One row, identical state: the upsert on (user_id, task) is the only effect.
    expect(await assignmentCount(user.userId)).toBe(1);
    expect(second.value.tasks).toEqual(first.value.tasks);
    expect(second.value.providers).toEqual(first.value.providers);

    const rows = await serviceDb()
      .select({ task: aiTaskModels.task, modelId: aiTaskModels.modelId })
      .from(aiTaskModels)
      .where(sql`${aiTaskModels.userId} = ${user.userId}::uuid`);
    expect(rows).toEqual([{ task: 'tutor', modelId: QUALIFIED_MODEL }]);
  });

  it('CL-3 — un modèle non qualifié refuse la tâche même pour un abonné', async () => {
    const user = await createUser('cl3');
    await serviceDb().transaction((tx) =>
      upsertSubscription(tx, {
        userId: user.userId,
        status: 'active',
        currentPeriodEnd: FUTURE,
      }),
    );
    const credentialId = await createKey(user);
    await qualify(user, credentialId);
    const assigned = await updateAiModels(user.ctx, {
      action: 'assign',
      task: 'tutor',
      credentialId,
      modelId: QUALIFIED_MODEL,
    });
    expect(assigned.ok).toBe(true);

    // The re-test fails: the stored choice stays, the screen reports it and resolution refuses.
    const failed = await qualifyCredential(user.ctx, credentialId, QUALIFIED_MODEL, {
      mockScenario: 'qualification-invalid-brick',
    });
    expect(failed.ok).toBe(true);
    const state = await getAiModelsState(user.ctx);
    if (!state.ok) throw state.error;
    expect(state.value.tasks.find((task) => task.task === 'tutor')).toMatchObject({
      available: false,
      unavailableReason: 'credential_not_qualified',
    });

    // No silent paid fallback: the subscriber does not get the provided model here.
    const resolved = await resolveModel(serviceDb(), { userId: user.userId, task: 'tutor' });
    expect(resolved.ok).toBe(false);
    if (!resolved.ok) {
      expect(resolved.error.code).toBe('AI_UNAVAILABLE');
      expect(resolved.error.reason).toBe('credential_not_qualified');
    }
  });

  it('CL-4 — supprimer la clé retire ses affectations dans la même transaction', async () => {
    const user = await createUser('cl4');
    const credentialId = await createKey(user);
    await qualify(user, credentialId);
    await updateAiModels(user.ctx, {
      action: 'assign',
      task: 'programme',
      credentialId,
      modelId: QUALIFIED_MODEL,
    });
    expect(await assignmentCount(user.userId)).toBe(1);

    const removed = await deleteCredential(user.ctx, credentialId);
    expect(removed.ok).toBe(true);
    expect(await assignmentCount(user.userId)).toBe(0);
    const state = await getAiModelsState(user.ctx);
    if (!state.ok) throw state.error;
    expect(state.value.providers).toHaveLength(1);
    expect(state.value.tasks.every((task) => task.available)).toBe(true);
  });
});
