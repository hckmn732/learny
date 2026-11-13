// Integration of the SPEC-507 cost guard and journal (CA-1 to CA-4, CL-2 to CL-5).
//
// Postgres is real: advisory locks, RLS, the local-day function and the notification dedupe are
// exercised. Users are committed because the concurrency test needs several connections; they are
// removed after each test. No provider is called: the caller supplies the usage of the simulated
// model and the journal computes the configured price.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { closeDb, serviceDb, sql, userDb } from '@learny/db';
import { aiBudgetReservations, aiCalls, notifications, upsertSubscription } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { checkAndReserveAiBudget, getAiUsage, recordAiCall } from '@learny/services/ai';

import { createServiceContext, type ServiceContext } from '../../src/context';

const PREFIX = 'sdd-507-';
const FIXED = new Date('2026-11-11T12:20:00Z');
const FUTURE = new Date('2026-12-11T12:20:00Z');

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

async function createUser(label: string): Promise<{ userId: string; ctx: ServiceContext }> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const user = await serviceDb().transaction((tx) =>
    createTestUser(tx, { email, timezone: 'Europe/Paris' }),
  );
  await serviceDb().transaction((tx) =>
    upsertSubscription(tx, { userId: user.id, status: 'active', currentPeriodEnd: FUTURE }),
  );
  return {
    userId: user.id,
    ctx: createServiceContext({
      userId: user.id,
      email,
      requestId: randomUUID(),
      clock: new TestClock(),
    }),
  };
}

async function cleanup(): Promise<void> {
  await serviceDb().execute(sql`delete from auth.users where email like ${`${PREFIX}%`}`);
}

async function callCount(userId: string): Promise<number> {
  const rows = await serviceDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(aiCalls)
    .where(sql`${aiCalls.userId} = ${userId}::uuid`);
  return rows[0]?.count ?? 0;
}

async function notificationRows(userId: string) {
  return serviceDb()
    .select({
      type: notifications.type,
      dedupeKey: notifications.dedupeKey,
      title: notifications.title,
    })
    .from(notifications)
    .where(sql`${notifications.userId} = ${userId}::uuid`)
    .orderBy(notifications.createdAt);
}

async function reserveRows(userId: string) {
  return serviceDb()
    .select()
    .from(aiBudgetReservations)
    .where(sql`${aiBudgetReservations.userId} = ${userId}::uuid`);
}

async function spendCall(
  ctx: ServiceContext,
  input: {
    userId: string;
    formationId?: string | null;
    inputTokens: number;
    outputTokens?: number;
    task?: 'programme' | 'course' | 'gaps' | 'tutor' | 'light';
    model?: string;
    status?: 'ok' | 'error' | 'refused' | 'capped' | 'invalid_output';
    batch?: boolean;
    at?: Date;
  },
) {
  const result = await recordAiCall(
    ctx,
    {
      userId: input.userId,
      formationId: input.formationId ?? null,
      task: input.task ?? 'tutor',
      provider: 'anthropic',
      model: input.model ?? 'claude-opus-5-5',
      managed: true,
      usage: {
        inputTokens: input.inputTokens,
        outputTokens: input.outputTokens ?? 0,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      },
      latencyMs: 120,
      status: input.status ?? 'ok',
      batch: input.batch ?? false,
      ...(input.at === undefined ? {} : { at: input.at }),
    },
    { sdb: serviceDb() },
  );
  if (!result.ok) throw result.error;
  return result.value;
}

beforeEach(cleanup);
afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await closeDb();
});

describe('[SPEC-507] service', () => {
  it('CA-1, CA-4 — 1,20 USD crée une seule alerte et une ligne de journal complète', async () => {
    const { userId, ctx } = await createUser('alert');
    const first = await spendCall(ctx, { userId, inputTokens: 300_000 });
    expect(first.call.costUsd).toBe('1.200000');
    expect(first.call.model).toBe('claude-opus-5-5');
    expect(first.call.managed).toBe(true);
    expect(first.call.batch).toBe(false);
    expect(first.alertCreated).toBe(true);

    const second = await spendCall(ctx, {
      userId,
      inputTokens: 1_000,
      outputTokens: 1_000,
      task: 'light',
      model: 'claude-haiku-5-5',
    });
    expect(second.alertCreated).toBe(false);
    const alerts = (await notificationRows(userId)).filter((row) => row.type === 'ai_cost_alert');
    expect(alerts).toHaveLength(1);
    expect(alerts[0]?.dedupeKey).toBe('ai_cost_alert:2026-11-11');
    expect(alerts[0]?.title).toContain('plafond IA');

    const usage = await getAiUsage(ctx);
    expect(usage.ok).toBe(true);
    if (!usage.ok) return;
    expect(usage.value.spentUsd).toBe('1.200600');
    expect(usage.value.capUsd).toBe('1.500000');
    expect(usage.value.percentUsed).toBe(80.04);
    expect(usage.value.alert).toBe(true);
    expect(usage.value.day).toBe('2026-11-11');
    expect(usage.value.resetsAt).toBe('2026-11-11T23:00:00.000Z');
    expect(usage.value.history).toHaveLength(1);
    expect(usage.value.history[0]).toMatchObject({
      day: '2026-11-11',
      calls: 2,
      spentUsd: '1.200600',
    });
  });

  it('CA-2, CL-2 — au plafond : Haiku pour le tuteur, programme reporté et notifié une fois', async () => {
    const { userId, ctx } = await createUser('cap');
    await spendCall(ctx, { userId, inputTokens: 375_000 });
    const tutor = await checkAndReserveAiBudget(ctx, {
      userId,
      task: 'tutor',
      model: 'claude-sonnet-5-5',
      estimatedInputTokens: 4_000,
      estimatedOutputTokens: 1_000,
    });
    expect(tutor.ok).toBe(true);
    if (!tutor.ok) return;
    expect(tutor.value.decision).toBe('downgrade');
    expect(tutor.value.model).toBe('claude-haiku-5-5');
    expect(tutor.value.reservationId).not.toBeNull();
    expect(tutor.value.resetsAt).toBe('2026-11-11T23:00:00.000Z');

    const programme = await checkAndReserveAiBudget(ctx, {
      userId,
      task: 'programme',
      model: 'claude-opus-5-5',
      estimatedInputTokens: 4_000,
      estimatedOutputTokens: 1_000,
    });
    expect(programme.ok).toBe(true);
    if (!programme.ok) return;
    expect(programme.value.decision).toBe('defer');
    expect(programme.value.defer).toBe(true);
    expect(programme.value.deferredNotified).toBe(true);

    const again = await checkAndReserveAiBudget(ctx, {
      userId,
      task: 'programme',
      model: 'claude-opus-5-5',
      estimatedInputTokens: 4_000,
      estimatedOutputTokens: 1_000,
    });
    if (!again.ok) throw again.error;
    expect(again.value.decision).toBe('defer');
    expect(again.value.deferredNotified).toBe(false);
    const deferrals = (await notificationRows(userId)).filter(
      (row) => row.type === 'ai_task_failed',
    );
    expect(deferrals).toHaveLength(1);
    expect(deferrals[0]?.dedupeKey).toBe('ai_programme_deferred:2026-11-11');

    const rows = await serviceDb()
      .select()
      .from(aiCalls)
      .where(sql`${aiCalls.userId} = ${userId}::uuid and ${aiCalls.status} = 'capped'`);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ errorCode: 'AI_CAP_REACHED', costUsd: '0.000000' });
  });

  it('CA-3, CL-5 — deux appels simultanés ne réservent pas deux fois le même plafond', async () => {
    const { userId, ctx } = await createUser('concurrent');
    const attempt = () =>
      checkAndReserveAiBudget(ctx, {
        userId,
        task: 'programme',
        model: 'claude-opus-5-5',
        estimatedInputTokens: 100_000,
        estimatedOutputTokens: 30_000,
      });
    const [left, right] = await Promise.all([attempt(), attempt()]);
    expect(left.ok && right.ok).toBe(true);
    if (!left.ok || !right.ok) return;
    const decisions = [left.value.decision, right.value.decision].sort();
    expect(decisions).toEqual(['allow', 'defer']);
    const allowed = left.value.decision === 'allow' ? left.value : right.value;
    expect(allowed.reservationId).not.toBeNull();
    expect(await reserveRows(userId)).toHaveLength(1);

    // CL-3 — une clé personnelle ne consomme pas le plafond.
    const personal = await checkAndReserveAiBudget(ctx, {
      userId,
      task: 'tutor',
      model: 'gpt-personnel',
      estimatedInputTokens: 1_000_000,
      estimatedOutputTokens: 1_000_000,
      managed: false,
    });
    if (!personal.ok) throw personal.error;
    expect(personal.value.decision).toBe('allow');
    expect(personal.value.reservationId).toBeNull();
    expect(personal.value.spentUsd).toBe('0.000000');
  });

  it('CA-4 — les agrégats par formation et jour et la RLS de deux utilisateurs', async () => {
    const { userId, ctx } = await createUser('usage');
    const other = await createUser('usage-other');
    const [programmeA, programmeB] = await serviceDb().transaction(async (tx) => {
      const a = await createTestProgramme(tx, userId, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
      });
      const b = await createTestProgramme(tx, userId, {
        modules: 1,
        chaptersPerModule: 1,
        notionsPerChapter: 1,
      });
      return [a, b];
    });
    await spendCall(ctx, {
      userId,
      formationId: programmeA.formationId,
      inputTokens: 2_400,
      outputTokens: 600,
    });
    await spendCall(ctx, {
      userId,
      formationId: programmeB.formationId,
      inputTokens: 800,
      outputTokens: 200,
      task: 'light',
      model: 'claude-haiku-5-5',
      batch: true,
    });
    await spendCall(ctx, {
      userId,
      formationId: programmeA.formationId,
      inputTokens: 0,
      outputTokens: 0,
      status: 'refused',
    });
    await spendCall(ctx, {
      userId,
      formationId: programmeA.formationId,
      inputTokens: 2_000,
      outputTokens: 500,
      at: new Date('2026-11-10T12:20:00Z'),
    });
    const otherCall = await spendCall(other.ctx, {
      userId: other.userId,
      inputTokens: 10_000,
      outputTokens: 1_000,
    });
    expect(otherCall.call.costUsd).toBe('0.060000');

    const usage = await getAiUsage(ctx);
    if (!usage.ok) throw usage.error;
    expect(usage.value.history.length).toBe(3);
    expect(
      usage.value.history.every(
        (row) =>
          row.formationId === programmeA.formationId || row.formationId === programmeB.formationId,
      ),
    ).toBe(true);
    const byFormation = usage.value.history.filter((row) => row.day === '2026-11-11');
    expect(byFormation).toHaveLength(2);
    expect(byFormation.map((row) => row.calls).sort()).toEqual([1, 2]);
    expect(usage.value.spentUsd).toBe('0.021690');
    expect(usage.value.percentUsed).toBe(1.45);

    // RLS — le journal du service n'est pas lisible par un apprenant.
    const visibleReservations = await userDb({ userId }).run((tx) =>
      tx.select().from(aiBudgetReservations),
    );
    expect(visibleReservations).toEqual([]);
  });

  it('reprise idempotente — rejouer une réservation consommée ne crée aucune seconde ligne', async () => {
    const { userId, ctx } = await createUser('replay');
    const budget = await checkAndReserveAiBudget(ctx, {
      userId,
      task: 'tutor',
      model: 'claude-sonnet-5-5',
      estimatedInputTokens: 2_000,
      estimatedOutputTokens: 500,
    });
    if (!budget.ok) throw budget.error;
    const reservationId = budget.value.reservationId;
    if (reservationId === null) throw new Error('réservation attendue');
    const firstCall = await recordAiCall(
      ctx,
      {
        userId,
        task: 'tutor',
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
        managed: true,
        usage: { inputTokens: 2_000, outputTokens: 500 },
        latencyMs: 120,
        status: 'ok',
        reservationId,
      },
      { sdb: serviceDb() },
    );
    if (!firstCall.ok) throw firstCall.error;
    const first = firstCall.value;
    expect(first.replayed).toBe(false);
    const replay = await recordAiCall(
      ctx,
      {
        userId,
        task: 'tutor',
        provider: 'anthropic',
        model: 'claude-sonnet-5-5',
        managed: true,
        usage: { inputTokens: 2_000, outputTokens: 500 },
        latencyMs: 120,
        status: 'ok',
        reservationId,
      },
      { sdb: serviceDb() },
    );
    if (!replay.ok) throw replay.error;
    expect(replay.value.replayed).toBe(true);
    expect(replay.value.call.id).toBe(first.call.id);
    expect(await callCount(userId)).toBe(1);
    const reservations = await reserveRows(userId);
    expect(reservations).toHaveLength(1);
    expect(reservations[0]?.status).toBe('consumed');
    expect(reservations[0]?.callId).toBe(first.call.id);
  });
});
