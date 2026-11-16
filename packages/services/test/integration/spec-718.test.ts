// Integration service and API rules of SPEC-718 (BR-AUT-07, ADR-0190).
//
// Postgres is real: the session creation under RLS, the `quiz_smoothed` journal row written on the
// automation role, the absence of a review log for a deferred notion and the reopening after an
// undo are exercised on committed rows. Every learner gets its own formation; accounts are removed.
import { randomUUID } from 'node:crypto';

import type { SQL } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { AppError } from '@learny/core';
import {
  closeDb,
  decideAutomationAction,
  serviceDb,
  sql,
  undoAutomationAction as undoActionRow,
} from '@learny/db';
import { createTestCourse, createTestProgramme, createTestUser } from '@learny/db/testing';
import { createNotionState } from '@learny/testing';

import { createBrick } from '../../src/bricks';
import { createServiceContext, type ServiceContext } from '../../src/context';
import { getOrCreateTodaySession } from '../../src/review';

const PREFIX = 'sdd-718-';
const FIXED = new Date('2026-11-11T12:20:00Z');

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

interface Learner {
  userId: string;
  email: string;
  formationId: string;
  notionIds: string[];
  ctx: ServiceContext;
}

async function cleanup(): Promise<void> {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
}

afterEach(async () => {
  await cleanup();
});

afterAll(async () => {
  await cleanup();
  await closeDb();
});

async function createLearner(label: string, notions: number): Promise<Learner> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const base = await serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email, timezone: 'Europe/Paris' });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: notions,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = programme.moduleIds[0];
    if (moduleId === undefined) throw new Error('module de test absent');
    await createTestCourse(tx, { ownerId: user.id, moduleId });
    await tx.execute(sql`
      update public.modules set status = 'validated' where formation_id = ${programme.formationId}::uuid
    `);
    return { user, programme };
  });
  return {
    userId: base.user.id,
    email,
    formationId: base.programme.formationId,
    notionIds: base.programme.notionIds,
    ctx: createServiceContext({
      userId: base.user.id,
      email,
      requestId: randomUUID(),
      clock: new TestClock(),
    }),
  };
}

async function prepareDue(learner: Learner, maxMinutes: number): Promise<void> {
  for (const notionId of learner.notionIds) {
    await serviceDb().transaction(async (tx) => {
      await createNotionState(tx, {
        userId: learner.userId,
        notionId,
        mastery: 70,
        dueAt: new Date('2026-11-11T08:00:00Z'),
      });
    });
    const created = await createBrick(learner.ctx, {
      type: 'choice_question',
      formationId: learner.formationId,
      purpose: 'review',
      origin: 'tutor',
      notionIds: [notionId],
      payload: {
        stem: 'Quel élément classe une pièce comptable ?',
        mode: 'single',
        options: [
          { id: 'a', text: 'Le type de pièce', correct: true, notionId },
          { id: 'b', text: 'Le ledger', correct: false, notionId },
        ],
        explanation: 'Le type de pièce classe toute la pièce comptable.',
        objective: 'Distinguer le type de pièce',
        sources: [],
      },
      createdBy: 'tutor',
    });
    if (!created.ok) throw created.error;
  }
  await serviceDb().execute(sql`
    insert into public.automation_settings (user_id, key, enabled, params)
    values (
      ${learner.userId}::uuid, 'plafond_quiz', true,
      ${JSON.stringify({ maxMinutes, targetRetention: 0.9 })}::jsonb
    )
    on conflict (user_id, key) do update
      set enabled = excluded.enabled, params = excluded.params
  `);
}

async function countRows(query: SQL): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(query);
  return rows[0]?.count ?? 0;
}

describe('[SPEC-718] service et API', () => {
  it('CA-2 — reporte sous le plafond, journalise une action et ne crée aucun review log', async () => {
    const learner = await createLearner('smoothed', 8);
    await prepareDue(learner, 2);

    const first = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
    expect(first.ok).toBe(true);
    if (!first.ok) throw first.error;
    expect(first.value.smoothing).not.toBeNull();
    expect(first.value.smoothing?.actionId).not.toBeNull();
    expect(first.value.smoothing?.capMinutes).toBe(2);
    expect(first.value.smoothing?.deferredCount).toBeGreaterThan(0);
    expect(first.value.items.length).toBeLessThan(learner.notionIds.length);

    const actions = await countRows(sql`
      select count(*)::int as count from public.automation_actions
      where user_id = ${learner.userId}::uuid
        and automation = 'plafond_quiz' and kind = 'quiz_smoothed'
    `);
    expect(actions).toBe(1);
    const logsBefore = await countRows(sql`
      select count(*)::int as count from public.review_logs
      where user_id = ${learner.userId}::uuid
    `);
    expect(logsBefore).toBe(0);

    // Deux requêtes identiques : aucun second effet, aucun second événement.
    const second = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
    expect(second.ok).toBe(true);
    if (!second.ok) throw second.error;
    expect(second.value.sessionId).toBe(first.value.sessionId);
    expect(
      await countRows(sql`
        select count(*)::int as count from public.automation_actions
        where user_id = ${learner.userId}::uuid
          and automation = 'plafond_quiz' and kind = 'quiz_smoothed'
      `),
    ).toBe(1);
    expect(
      await countRows(sql`
        select count(*)::int as count from public.event_outbox
        where user_id = ${learner.userId}::uuid and name = 'automation/action-applied'
      `),
    ).toBe(1);

    const actionId = first.value.smoothing?.actionId ?? '';
    await serviceDb().transaction((tx) =>
      undoActionRow(tx, { userId: learner.userId, actionId, undoneAt: FIXED }),
    );
    const reopened = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
    expect(reopened.ok).toBe(true);
    if (!reopened.ok) throw reopened.error;
    expect(reopened.value.smoothing).toBeNull();
    expect(reopened.value.header.notionCount).toBe(learner.notionIds.length);
    expect(reopened.value.items.length).toBeGreaterThan(first.value.items.length);

    // Annuler réintroduit une seule fois : le second GET ne duplique ni item ni action.
    const replay = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw replay.error;
    expect(replay.value.items.length).toBe(reopened.value.items.length);
    expect(
      await countRows(sql`
        select count(*)::int as count from public.automation_actions
        where user_id = ${learner.userId}::uuid
          and automation = 'plafond_quiz' and kind = 'quiz_smoothed'
      `),
    ).toBe(1);
    expect(
      await countRows(sql`
        select count(*)::int as count from public.review_logs
        where user_id = ${learner.userId}::uuid
      `),
    ).toBe(0);
  });

  it('CA-3 — 400, 404 RLS et 409 sur un état obsolète, sans écriture', async () => {
    const owner = await createLearner('owner', 4);
    const stranger = await createLearner('stranger', 2);
    await prepareDue(owner, 2);

    const invalid = await getOrCreateTodaySession(owner.ctx, 'pas-un-uuid', 'full');
    expect(invalid.ok).toBe(false);
    if (invalid.ok) return;
    expect(invalid.error.code).toBe('VALIDATION_FAILED');

    const foreign = await getOrCreateTodaySession(stranger.ctx, owner.formationId, 'full');
    expect(foreign.ok).toBe(false);
    if (foreign.ok) return;
    expect(foreign.error.code).toBe('NOT_FOUND');

    const created = await getOrCreateTodaySession(owner.ctx, owner.formationId, 'full');
    expect(created.ok).toBe(true);
    if (!created.ok) throw created.error;
    const actionId = created.value.smoothing?.actionId ?? '';
    expect(actionId).not.toBe('');

    await expect(
      serviceDb().transaction((tx) =>
        decideAutomationAction(tx, {
          userId: owner.userId,
          actionId,
          decision: 'decline',
          decidedAt: FIXED,
        }),
      ),
    ).rejects.toBeInstanceOf(AppError);

    const statuses = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.automation_actions
      where id = ${actionId}::uuid
    `);
    expect(statuses[0]?.status).toBe('applied');
  });

  it('CA-1, CL-3 — les réglages par défaut sont appliqués et une journée vide ne crée rien', async () => {
    const learner = await createLearner('empty', 3);
    const empty = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
    expect(empty.ok).toBe(true);
    if (!empty.ok) throw empty.error;
    expect(empty.value.status).toBe('empty');
    expect(empty.value.smoothing).toBeNull();
    expect(
      await countRows(sql`
        select count(*)::int as count from public.activities
        where owner_id = ${learner.userId}::uuid
      `),
    ).toBe(0);
    expect(
      await countRows(sql`
        select count(*)::int as count from public.automation_actions
        where user_id = ${learner.userId}::uuid
      `),
    ).toBe(0);
  });
});
