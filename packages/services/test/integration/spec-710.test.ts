// Integration tests of the Automatismes settings screen (SPEC-710 §12, CA-1 to CA-3).
//
// Real Postgres with the RLS client of the learner. The view reuses the engine of SPEC-711; the
// clock is frozen at 2026-11-11T12:20:00Z (ADR-0047) so the weekly counter, the journal order and
// the last action are deterministic.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { createLogger } from '@learny/core/server';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestUser } from '@learny/db/testing';

import {
  buildAutomationSettingsView,
  loadAutomationSettingsView,
  undoAutomation,
  updateAutomationSetting,
} from '../../../automations/src/parametres-automatismes';
import { createAutomationActionQuiet } from '../../src/automations';
import { createServiceContext, type ServiceContext } from '../../src/context';

const PREFIX = 'sdd-710-';
const FIXED = new Date('2026-11-11T12:20:00Z');
const TIME_ZONE = 'Europe/Paris';

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
  const userId = await serviceDb().transaction(
    async (tx) => (await createTestUser(tx, { email, timezone: TIME_ZONE })).id,
  );
  return { userId, email };
}

function context(user: User): ServiceContext {
  return createServiceContext({
    userId: user.userId,
    email: user.email,
    requestId: randomUUID(),
    clock: new TestClock(),
    logger: createLogger({ level: 'error' }),
  });
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw result.error;
  return result.value;
}

async function createAction(
  userId: string,
  input: {
    automation: 'reprise' | 'echauffement' | 'sprint' | 'bilan' | 'remediation';
    summary: string;
    createdAt: string;
    undo?: boolean;
    status?: 'consumed' | 'undone';
  },
): Promise<string> {
  const dedupe = `spec-710:${randomUUID()}`;
  const created = await serviceDb().transaction((tx) =>
    createAutomationActionQuiet(tx, {
      userId,
      formationId: null,
      automation: input.automation,
      kind: `${input.automation}_test`,
      summary: input.summary,
      payload: { dedupeKey: dedupe },
      undoPayload: input.undo === true ? { restaure: true } : null,
      requiresConsent: false,
      createdAt: new Date(input.createdAt),
    }),
  );
  const actionId = created.action?.id;
  if (actionId === undefined) throw new Error('action non créée');
  if (input.status !== undefined) {
    await serviceDb().execute(sql`
      update public.automation_actions
      set status = ${input.status}::automation_status,
          decided_at = ${input.status === 'undone' ? FIXED.toISOString() : null}::timestamptz
      where id = ${actionId}::uuid
    `);
  }
  return actionId;
}

async function statusOf(actionId: string): Promise<string | undefined> {
  const rows = await serviceDb().execute<{ status: string }>(
    sql`select status::text as status from public.automation_actions where id = ${actionId}::uuid`,
  );
  return rows[0]?.status;
}

async function paramsOf(userId: string, key: string): Promise<Record<string, unknown> | null> {
  const rows = await serviceDb().execute<{ params: Record<string, unknown> }>(
    sql`select params from public.automation_settings
        where user_id = ${userId}::uuid and key = ${key}::automation_key`,
  );
  return rows[0]?.params ?? null;
}

afterEach(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
});

afterAll(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

describe('[SPEC-710] service et API', () => {
  it('CA-1, CA-2 — la vue groupe les dix automatismes, compte la semaine et date la dernière action', async () => {
    const alex = await createUser('view');
    const ctx = context(alex);

    const first = await createAction(alex.userId, {
      automation: 'reprise',
      summary: 'Reprise placée jeudi 10:30.',
      createdAt: '2026-11-10T20:00:00.000Z',
      undo: true,
    });
    await createAction(alex.userId, {
      automation: 'reprise',
      summary: 'Ancienne reprise de la semaine dernière.',
      createdAt: '2026-11-08T20:00:00.000Z',
    });
    await createAction(alex.userId, {
      automation: 'echauffement',
      summary: 'Échauffement de trois questions.',
      createdAt: '2026-11-11T06:00:00.000Z',
      status: 'consumed',
    });
    await createAction(alex.userId, {
      automation: 'sprint',
      summary: 'Sprint ajouté jeudi 16:30.',
      createdAt: '2026-11-09T19:00:00.000Z',
    });

    const view = unwrap(await loadAutomationSettingsView(ctx));
    expect(view.groups.map((group) => group.id)).toEqual(['decrochage', 'memoire', 'quiz']);
    expect(view.groups.flatMap((group) => group.items)).toHaveLength(9);
    expect(view.totalCount).toBe(9);
    expect(view.activeCount).toBe(9);
    expect(view.weeklyCount).toBe(3);
    expect(view.journal).toHaveLength(3);
    expect(view.journal[0]?.summary).toBe('Échauffement de trois questions.');
    expect(view.journal.map((entry) => entry.status)).toContain('consumed');
    expect(view.journal.map((entry) => entry.id)).toContain(first);

    const reprise = view.groups
      .flatMap((group) => group.items)
      .find((item) => item.key === 'reprise');
    expect(reprise?.lastAction?.summary).toBe('Reprise placée jeudi 10:30.');
    expect(reprise?.lastAction?.at).toBe('2026-11-10T20:00:00.000Z');
    expect(reprise?.values).toEqual({ inactiveDays: '2', lightenDays: '5', mode: 'accord' });

    // CA-1 — désactiver retire les réglages éditables, sans effacer l'historique.
    unwrap(await updateAutomationSetting(ctx, { automation: 'reprise', enabled: false }));
    const disabled = unwrap(await loadAutomationSettingsView(ctx));
    const disabledReprise = disabled.groups
      .flatMap((group) => group.items)
      .find((item) => item.key === 'reprise');
    expect(disabledReprise?.enabled).toBe(false);
    expect(disabledReprise?.settings).toEqual([]);
    expect(disabledReprise?.lastAction?.summary).toBe('Reprise placée jeudi 10:30.');
    expect(disabled.weeklyCount).toBe(3);
  });

  it('CA-2, CL-5 — une action consommée refuse l’annulation, une action appliquée change d’état', async () => {
    const alex = await createUser('undo');
    const other = await createUser('other');
    const ctx = context(alex);

    const applied = await createAction(alex.userId, {
      automation: 'reprise',
      summary: 'Reprise annulable.',
      createdAt: '2026-11-10T20:00:00.000Z',
      undo: true,
    });
    const consumed = await createAction(alex.userId, {
      automation: 'echauffement',
      summary: 'Échauffement déjà joué.',
      createdAt: '2026-11-11T06:00:00.000Z',
      status: 'consumed',
    });

    const refused = await undoAutomation(ctx, consumed);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe('AUTOMATION_ACTION_CONSUMED');
    expect(await statusOf(consumed)).toBe('consumed');

    // CL-1 — l'action d'un autre apprenant répond NOT_FOUND sans révéler son existence.
    const foreign = await undoAutomation(context(other), applied);
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe('NOT_FOUND');
    expect(await statusOf(applied)).toBe('applied');

    const undone = unwrap(await undoAutomation(ctx, applied));
    expect(undone.status).toBe('undone');
    expect(await statusOf(applied)).toBe('undone');

    const after = unwrap(await loadAutomationSettingsView(ctx));
    expect(after.journal.find((entry) => entry.id === applied)?.status).toBe('undone');
    expect(after.journal.find((entry) => entry.id === consumed)?.status).toBe('consumed');
    expect(after.weeklyCount).toBe(2);
  });

  it('CA-3, CL-1, CL-4 — une requête invalide ne crée rien, deux réglages identiques restent uniques', async () => {
    const alex = await createUser('settings');
    const ctx = context(alex);

    const before = await paramsOf(alex.userId, 'micro_seance');
    const invalid = await updateAutomationSetting(ctx, {
      automation: 'micro_seance',
      params: { hour: 25, durationMin: 5 },
    });
    expect(invalid.ok).toBe(false);
    if (!invalid.ok) expect(invalid.error.code).toBe('VALIDATION_FAILED');
    expect(await paramsOf(alex.userId, 'micro_seance')).toEqual(before);

    const invalidPause = await updateAutomationSetting(ctx, {
      automation: 'pause',
      params: { pauseUntil: 'demain' },
    });
    expect(invalidPause.ok).toBe(false);
    if (!invalidPause.ok) expect(invalidPause.error.code).toBe('VALIDATION_FAILED');

    // DEUX PATCH identiques : une seule ligne, même valeurs (upsert idempotent).
    const first = unwrap(
      await updateAutomationSetting(ctx, {
        automation: 'micro_seance',
        enabled: true,
        params: { hour: 21, durationMin: 10 },
      }),
    );
    const second = unwrap(
      await updateAutomationSetting(ctx, {
        automation: 'micro_seance',
        enabled: true,
        params: { hour: 21, durationMin: 10 },
      }),
    );
    // L'upsert est idempotent sur les valeurs ; seul `updated_at` avance avec l'horloge réelle.
    expect({ ...second, updatedAt: first.updatedAt }).toEqual(first);
    if (first.updatedAt === null || second.updatedAt === null) {
      throw new Error('updatedAt attendu après un upsert.');
    }
    expect(Date.parse(second.updatedAt)).toBeGreaterThanOrEqual(Date.parse(first.updatedAt));
    const rows = await serviceDb().execute<{ total: number }>(sql`
      select count(*)::int as total from public.automation_settings
       where user_id = ${alex.userId}::uuid and key = 'micro_seance'::automation_key
    `);
    expect(rows[0]?.total).toBe(1);
    expect(await paramsOf(alex.userId, 'micro_seance')).toEqual({ hour: 21, durationMin: 10 });

    // Les paramètres de pause sont désormais validés par le catalogue de SPEC-710.
    const pause = unwrap(
      await updateAutomationSetting(ctx, {
        automation: 'pause',
        params: { pauseUntil: '2026-11-22', diagnosticOnReturn: false },
      }),
    );
    expect(pause.params).toEqual({
      pauseUntil: '2026-11-22',
      diagnosticOnReturn: false,
      diagnosticMinutes: 10,
    });
  });

  it('CA-2, ET-4 — les valeurs par défaut du catalogue alimentent les clés non encore définies', async () => {
    const alex = await createUser('defaults');
    const view = unwrap(await loadAutomationSettingsView(context(alex)));
    const items = view.groups.flatMap((group) => group.items);
    const byKey = new Map(items.map((item) => [item.key, item]));
    expect(byKey.get('micro_seance')?.values).toEqual({ hour: '20', durationMin: '5' });
    expect(byKey.get('bilan')?.values).toEqual({ weekday: '7', hour: '19', channel: 'app' });
    expect(byKey.get('remediation')?.values).toEqual({
      retryDelayHours: '24',
      mode: 'advised',
    });
    expect(byKey.get('plafond_quiz')?.values).toEqual({
      maxMinutes: '15',
      targetRetention: '0.9',
    });

    const built = buildAutomationSettingsView(
      { paused: false, items: [] },
      { items: [], weekCount: 0, nextCursor: null },
    );
    expect(built.journal).toEqual([]);
    expect(built.groups.flatMap((group) => group.items)).toHaveLength(9);
  });
});
