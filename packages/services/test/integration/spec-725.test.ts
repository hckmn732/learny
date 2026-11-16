// Integration tests of the hosted-AI subscription block (SPEC-725 §12, CA-1 to CA-3).
//
// Real Postgres and the RLS client of the learner: the state composes the subscription of SPEC-210
// and the usage of SPEC-507. The clock is frozen at 2026-11-11T12:20:00Z (ADR-0047) so the local
// day, the cap and the reset instant are deterministic.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';

import {
  hasQualifiedPersonalKey,
  loadManagedAiState,
  managedAiCap,
} from '../../src/abonnement-a-l-ia-fournie-interface-et-plafond';
import { createServiceContext, type ServiceContext } from '../../src/context';

const PREFIX = 'sdd-725-';
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

async function createUser(label: string): Promise<User> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const row = await serviceDb().transaction((tx) => createTestUser(tx, { email }));
  return { userId: row.id, email: row.email };
}

function context(user: User): ServiceContext {
  return createServiceContext({
    userId: user.userId,
    email: user.email,
    requestId: randomUUID(),
    clock: new TestClock(),
  });
}

async function activate(userId: string): Promise<void> {
  await serviceDb().execute(sql`
    insert into public.subscriptions (user_id, status, current_period_end, daily_cap_usd)
    values (${userId}::uuid, 'active', '2026-12-11T00:00:00Z'::timestamptz, 1.5)
    on conflict (user_id) do update
      set status = 'active', current_period_end = excluded.current_period_end,
          daily_cap_usd = excluded.daily_cap_usd
  `);
}

async function spend(userId: string, amount: string): Promise<void> {
  await serviceDb().execute(sql`
    insert into public.ai_calls (
      user_id, task, provider, model, managed, cost_usd, status, created_at
    ) values (
      ${userId}::uuid, 'light', 'anthropic', 'claude-haiku-4-5-20251001', true,
      ${amount}::numeric, 'ok', '2026-11-11T10:00:00Z'::timestamptz
    )
  `);
}

afterEach(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
});

afterAll(async () => {
  await closeDb();
});

describe('[SPEC-725] service et API', () => {
  it('CA-1 — sans abonnement ni clé qualifiée, l’IA est indisponible ; avec abonnement actif, elle est fournie', async () => {
    const alex = await createUser('availability');
    const disconnected = await loadManagedAiState(context(alex), {
      hasQualifiedPersonalKey: false,
    });
    expect(disconnected.ok).toBe(true);
    if (disconnected.ok) {
      expect(disconnected.value.availability).toBe('unavailable');
      expect(disconnected.value.subscription.status).toBe('none');
      expect(disconnected.value.subscription.hasManagedAi).toBe(false);
    }

    await activate(alex.userId);
    const active = await loadManagedAiState(context(alex), { hasQualifiedPersonalKey: false });
    expect(active.ok).toBe(true);
    if (active.ok) {
      expect(active.value.availability).toBe('managed');
      expect(active.value.subscription.hasManagedAi).toBe(true);
    }

    const personal = await loadManagedAiState(context(alex), {
      hasQualifiedPersonalKey: true,
    });
    expect(personal.ok && personal.value.availability).toBe('managed');
    expect(hasQualifiedPersonalKey([])).toBe(false);
  });

  it('CA-2 — l’usage réel alimente la jauge, l’alerte à 80 % et le plafond atteint', async () => {
    const alex = await createUser('cap');
    await activate(alex.userId);
    await spend(alex.userId, '1.200000');

    const alert = await loadManagedAiState(context(alex), { hasQualifiedPersonalKey: false });
    expect(alert.ok).toBe(true);
    if (alert.ok) {
      expect(alert.value.usage.spentUsd).toBe('1.200000');
      expect(alert.value.usage.capUsd).toBe('1.500000');
      expect(alert.value.usage.percentUsed).toBe(80);
      expect(alert.value.usage.alert).toBe(true);
      expect(alert.value.usage.resetsAt).toBe('2026-11-11T23:00:00.000Z');
      expect(managedAiCap(alert.value.usage)).toBe('alert');
    }

    await spend(alex.userId, '0.500000');
    const reached = await loadManagedAiState(context(alex), {
      hasQualifiedPersonalKey: false,
    });
    expect(reached.ok).toBe(true);
    if (reached.ok) {
      expect(reached.value.usage.percentUsed).toBeGreaterThanOrEqual(100);
      expect(managedAiCap(reached.value.usage)).toBe('reached');
    }
  });

  it('CA-3 — l’état d’un apprenant ne contient jamais les données d’un autre', async () => {
    const alex = await createUser('alex');
    const sam = await createUser('sam');
    await activate(sam.userId);
    await spend(sam.userId, '1.400000');

    const alexState = await loadManagedAiState(context(alex), {
      hasQualifiedPersonalKey: false,
    });
    expect(alexState.ok).toBe(true);
    if (alexState.ok) {
      expect(alexState.value.subscription.status).toBe('none');
      expect(alexState.value.usage.spentUsd).toBe('0.000000');
      expect(alexState.value.availability).toBe('unavailable');
    }

    const samState = await loadManagedAiState(context(sam), { hasQualifiedPersonalKey: false });
    expect(samState.ok && samState.value.availability).toBe('managed');
    expect(samState.ok && samState.value.usage.spentUsd).toBe('1.400000');
  });
});
