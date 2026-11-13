// Integration of the onboarding service (SPEC-602 CA-2, CA-4, CA-7, ET-2).
// Postgres is real: RLS, monotone advancement, reminder side effects and the completion event.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';
import {
  advanceOnboarding,
  getOnboardingState,
  onboardingNeedsCheckout,
} from '@learny/services/onboarding';

import { createServiceContext, type ServiceContext } from '../../src/context';

const PREFIX = 'sdd-602-';
const FIXED = new Date('2026-11-11T12:20:00Z');

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

async function user(label: string): Promise<{ userId: string; ctx: ServiceContext }> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const created = await serviceDb().transaction((tx) => createTestUser(tx, { email }));
  return {
    userId: created.id,
    ctx: createServiceContext({
      userId: created.id,
      email,
      requestId: randomUUID(),
      clock: new TestClock(),
    }),
  };
}

async function qualifyAssignments(userId: string): Promise<void> {
  const credentialId = randomUUID();
  await serviceDb().execute(sql`
    insert into public.ai_credentials
      (id, user_id, provider, label, model_ids, encrypted_key, key_last4, status)
    values (
      ${credentialId}::uuid, ${userId}::uuid, 'anthropic', 'Test',
      array['claude-sonnet-5-5'], decode(repeat('00', 32), 'hex'), '0000', 'qualified'
    )
  `);
  for (const task of ['programme', 'course', 'gaps', 'tutor', 'light']) {
    await serviceDb().execute(sql`
      insert into public.ai_task_models (user_id, task, credential_id, model_id)
      values (${userId}::uuid, ${task}::ai_task, ${credentialId}::uuid, 'claude-sonnet-5-5')
    `);
  }
}

async function cleanup(): Promise<void> {
  await serviceDb().execute(sql`delete from auth.users where email like ${`${PREFIX}%`}`);
}

beforeAll(cleanup);
afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe('[SPEC-602] onboarding', () => {
  it('CA-2 — avance d’un cran et ne recule jamais', async () => {
    const { ctx } = await user('monotone');
    const first = await advanceOnboarding(ctx, { step: 'rythme' });
    expect(first).toMatchObject({ ok: true, value: { onboardingStep: 'rythme' } });
    const second = await advanceOnboarding(ctx, { step: 'ia' });
    expect(second).toMatchObject({ ok: true, value: { onboardingStep: 'ia' } });
    const back = await advanceOnboarding(ctx, { step: 'rythme' });
    expect(back).toMatchObject({ ok: true, value: { onboardingStep: 'ia' } });
  });

  it('CA-3 — rappels sans IA satisfaite répond 422 ONBOARDING_AI_REQUIRED', async () => {
    const { ctx } = await user('no-ai');
    await advanceOnboarding(ctx, { step: 'ia' });
    const refused = await advanceOnboarding(ctx, { step: 'rappels' });
    expect(refused).toMatchObject({ ok: false, error: { code: 'ONBOARDING_AI_REQUIRED' } });
  });

  it('CA-2, CA-3 — rappels écrit les trois interrupteurs et les quatre automatismes', async () => {
    const { userId, ctx } = await user('reminders');
    await advanceOnboarding(ctx, { step: 'rappels', aiChoice: 'managed' });
    const result = await advanceOnboarding(ctx, {
      step: 'depart',
      reminders: { push: false, email: true, automations: false },
    });
    expect(result).toMatchObject({ ok: true, value: { onboardingStep: 'depart' } });
    const rows = await serviceDb().execute<{
      channel_push: boolean;
      channel_email: boolean;
      enabled: boolean;
      key: string;
    }>(sql`
      select n.channel_push, n.channel_email, a.enabled, a.key::text as key
      from public.notification_settings n
      join public.automation_settings a on a.user_id = n.user_id
      where n.user_id = ${userId}::uuid
      order by a.key
    `);
    expect(rows.find((row) => row.key === 'reprise')?.enabled).toBe(false);
    expect(rows.find((row) => row.key === 'micro_seance')?.enabled).toBe(false);
    expect(rows.find((row) => row.key === 'echauffement')?.enabled).toBe(false);
    expect(rows.find((row) => row.key === 'plafond_quiz')?.enabled).toBe(false);
    expect(rows.find((row) => row.key === 'remediation')?.enabled).toBe(true);
    expect(rows[0]?.channel_push).toBe(false);
    expect(rows[0]?.channel_email).toBe(true);
  });

  it('CA-7 — done fixe la date et n’émet qu’un seul événement', async () => {
    const { userId, ctx } = await user('done');
    await advanceOnboarding(ctx, { step: 'rappels', aiChoice: 'managed' });
    await advanceOnboarding(ctx, { step: 'depart' });
    const first = await advanceOnboarding(ctx, { step: 'done' });
    const second = await advanceOnboarding(ctx, { step: 'done' });
    expect(first).toMatchObject({ ok: true, value: { onboardingStep: 'done' } });
    expect(second).toMatchObject({ ok: true, value: { onboardingStep: 'done' } });
    const rows = await serviceDb().execute<{ completed: string | null; events: number }>(sql`
      select p.onboarding_completed_at::text as completed,
             (select count(*)::int from public.event_outbox e
               where e.user_id = p.id and e.name = 'user/onboarding-completed') as events
      from public.profiles p where p.id = ${userId}::uuid
    `);
    expect(rows[0]?.completed).not.toBeNull();
    expect(new Date(rows[0]?.completed ?? '').toISOString()).toBe(FIXED.toISOString());
    expect(rows[0]?.events).toBe(1);
  });

  it('CA-5 — Checkout requis sans cinq affectations ni abonnement actif', async () => {
    const { userId, ctx } = await user('checkout');
    expect(await onboardingNeedsCheckout(ctx)).toBe(true);
    const before = await getOnboardingState(ctx);
    expect(before.ok && before.value.needsCheckout).toBe(true);
    await qualifyAssignments(userId);
    expect(await onboardingNeedsCheckout(ctx)).toBe(false);
    const after = await getOnboardingState(ctx);
    expect(after.ok && after.value.needsCheckout).toBe(false);
  });
});
