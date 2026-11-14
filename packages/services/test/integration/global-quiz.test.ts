// Integration tests of the daily global quiz session (SPEC-701 §12, CA-1 to CA-8, CL-2, CL-7).
//
// Postgres is real: the consultative lock, the idempotent creation, the FSRS update of an answer,
// the closure of the streak and the RLS guard are exercised against committed rows. Each learner
// gets its own programme; every account is removed at the end.
import { randomUUID } from 'node:crypto';

import type { SQL } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestCourse, createTestProgramme, createTestUser } from '@learny/db/testing';
import { createNotionState } from '@learny/testing';

import { createBrick, reportBrick } from '../../src/bricks';
import { createServiceContext, type ServiceContext } from '../../src/context';
import { answerReviewItem, completeReviewSession, getOrCreateTodaySession } from '../../src/review';

const PREFIX = 'sdd-701-';
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
  moduleIds: string[];
  notionIds: string[];
  courseId: string;
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

async function createLearner(label: string, options: { notions: number }): Promise<Learner> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const base = await serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email, timezone: 'Europe/Paris' });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: options.notions,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = programme.moduleIds[0];
    if (moduleId === undefined) throw new Error('module de test absent');
    const course = await createTestCourse(tx, { ownerId: user.id, moduleId });
    await tx.execute(sql`
      update public.modules set status = 'validated' where formation_id = ${programme.formationId}::uuid
    `);
    return { user, programme, course };
  });
  return {
    userId: base.user.id,
    email,
    formationId: base.programme.formationId,
    moduleIds: base.programme.moduleIds,
    notionIds: base.programme.notionIds,
    courseId: base.course.courseId,
    ctx: createServiceContext({
      userId: base.user.id,
      email,
      requestId: randomUUID(),
      clock: new TestClock(),
    }),
  };
}

async function dueState(
  learner: Learner,
  notionId: string,
  gap: 'forgetting' | 'confusion' | null = null,
): Promise<void> {
  await serviceDb().transaction(async (tx) => {
    await createNotionState(tx, {
      userId: learner.userId,
      notionId,
      gapNature: gap,
      mastery: gap === null ? 70 : 45,
      dueAt: new Date('2026-11-11T08:00:00Z'),
    });
  });
}

function choicePayload(notionId: string): unknown {
  return {
    stem: 'Quel élément classe une pièce comptable ?',
    mode: 'single',
    options: [
      { id: 'a', text: 'Le type de pièce', correct: true, notionId },
      { id: 'b', text: 'Le ledger', correct: false, notionId },
    ],
    explanation: 'Le type de pièce classe toute la pièce comptable.',
    objective: 'Distinguer le type de pièce',
    sources: [],
  };
}

const RECALL_PAYLOAD = {
  front: 'Que définit une variante d’exercice comptable ?',
  back: 'Le nombre de périodes comptables d’un exercice, et leurs dates de début et de fin.',
  sourceLabel: 'votre cours du module 1, chapitre 1',
  sources: [],
};

async function reviewBrick(
  learner: Learner,
  notionId: string,
  type: 'choice_question' | 'recall_card' = 'choice_question',
): Promise<{ brickId: string; versionId: string }> {
  const created = await createBrick(learner.ctx, {
    type,
    formationId: learner.formationId,
    purpose: 'review',
    origin: 'tutor',
    notionIds: [notionId],
    payload: type === 'recall_card' ? RECALL_PAYLOAD : choicePayload(notionId),
    createdBy: 'tutor',
  });
  if (!created.ok) throw created.error;
  return { brickId: created.value.brickId, versionId: created.value.versionId };
}

async function countRows(query: SQL): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(query);
  return rows[0]?.count ?? 0;
}

describe('[SPEC-701] session du jour', () => {
  it('CA-1 — deux GET du même jour renvoient la même session et une seule activité', async () => {
    const learner = await createLearner('idem', { notions: 2 });
    for (const notionId of learner.notionIds) {
      await dueState(learner, notionId);
      await reviewBrick(learner, notionId);
    }

    const first = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
    expect(first.ok).toBe(true);
    if (!first.ok) throw first.error;
    expect(first.value.status).toBe('in_progress');
    expect(first.value.items).toHaveLength(2);

    const second = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
    expect(second.ok).toBe(true);
    if (!second.ok) throw second.error;
    expect(second.value.sessionId).toBe(first.value.sessionId);

    const activities = await countRows(sql`
      select count(*)::int as count
      from public.activities
      where owner_id = ${learner.userId}::uuid
        and formation_id = ${learner.formationId}::uuid
        and kind = 'global_quiz_session'::public.activity_kind
        and for_date = '2026-11-11'::date
        and config->>'mode' = 'full'
    `);
    expect(activities).toBe(1);

    // ET-11 — p95 of the idempotent read on the demonstration-sized session.
    const samples: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      const started = performance.now();
      const replay = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
      expect(replay.ok).toBe(true);
      samples.push(performance.now() - started);
    }
    samples.sort((left, right) => left - right);
    const p95 = samples[Math.ceil(samples.length * 0.95) - 1] ?? 0;
    expect(p95).toBeLessThan(300);
  });

  it('CA-2 — lacunes en tête, plafond de 15 min et notions reportées toujours dues', async () => {
    const learner = await createLearner('cap', { notions: 20 });
    for (const [index, notionId] of learner.notionIds.entries()) {
      await dueState(learner, notionId, index === 0 ? 'forgetting' : null);
      await reviewBrick(learner, notionId, index === 0 ? 'recall_card' : 'choice_question');
    }

    const session = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
    expect(session.ok).toBe(true);
    if (!session.ok) throw session.error;
    expect(session.value.status).toBe('in_progress');
    expect(session.value.items.length).toBeLessThan(20);
    expect(session.value.header.estimatedMinutes).toBeLessThanOrEqual(15);
    expect(session.value.items[0]?.type).toBe('recall_card');
    expect(session.value.items[0]?.notionIds).toContain(learner.notionIds[0]);

    const stillDue = await countRows(sql`
      select count(*)::int as count
      from public.notion_states
      where user_id = ${learner.userId}::uuid
        and in_review
        and due_at <= '2026-11-11T23:59:59Z'::timestamptz
    `);
    expect(stillDue).toBe(20);
  });

  it('CA-3 — une brique signalée retire son item non répondu (withdrawn)', async () => {
    const learner = await createLearner('report', { notions: 2 });
    for (const notionId of learner.notionIds) {
      await dueState(learner, notionId);
      await reviewBrick(learner, notionId);
    }
    const session = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
    expect(session.ok).toBe(true);
    if (!session.ok) throw session.error;
    const target = session.value.items[0];
    if (target === undefined) throw new Error('item de test absent');

    const reported = await reportBrick(learner.ctx, target.brickId, {
      reason: 'La correction est fausse sur cette brique.',
    });
    expect(reported.ok).toBe(true);

    const replay = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw replay.error;
    expect(replay.value.items).toHaveLength(1);
    expect(replay.value.items[0]?.position).toBe(1);

    const withdrawn = await countRows(sql`
      select count(*)::int as count
      from public.activities a
      cross join lateral jsonb_array_elements(a.config->'items') as item
      where a.id = ${session.value.sessionId ?? randomUUID()}::uuid
        and item->>'withdrawn' = 'true'
    `);
    expect(withdrawn).toBe(1);
  });

  it('CA-4 — « Bon » écrit la réponse, le journal et l’échéance FSRS affichée', async () => {
    const learner = await createLearner('card', { notions: 1 });
    const notionId = learner.notionIds[0] as string;
    await dueState(learner, notionId);
    await reviewBrick(learner, notionId, 'recall_card');
    const session = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
    expect(session.ok).toBe(true);
    if (!session.ok) throw session.error;
    const item = session.value.items[0];
    if (item === undefined || item.intervals === null) throw new Error('carte de test absente');

    const clientAnswerId = randomUUID();
    const answered = await answerReviewItem(learner.ctx, session.value.sessionId as string, {
      position: 0,
      clientAnswerId,
      timeMs: 4_200,
      response: { selfRating: 'good' },
    });
    expect(answered.ok).toBe(true);
    if (!answered.ok) throw answered.error;
    expect(answered.value.isCorrect).toBe(true);
    const nextDueAt = answered.value.notions[0]?.nextDueAt;
    expect(nextDueAt).toBeTruthy();

    const answerRows = await serviceDb().execute<{
      response: unknown;
      feedback: unknown;
      graded_by: string;
    }>(sql`
      select response, feedback, graded_by::text as graded_by
      from public.answers a
      join public.attempts at on at.id = a.attempt_id
      where at.user_id = ${learner.userId}::uuid
        and feedback->>'clientAnswerId' = ${clientAnswerId}
    `);
    expect(answerRows[0]?.response).toEqual({ selfGrade: 'good' });
    expect(answerRows[0]?.graded_by).toBe('code');

    const logs = await serviceDb().execute<{ source: string; grade: string }>(sql`
      select source::text as source, grade::text as grade
      from public.review_logs
      where user_id = ${learner.userId}::uuid and notion_id = ${notionId}::uuid
    `);
    expect(logs[0]).toMatchObject({ source: 'global_quiz', grade: 'good' });

    const state = await serviceDb().execute<{ due_at: string }>(sql`
      select due_at::text as due_at
      from public.notion_states
      where user_id = ${learner.userId}::uuid and notion_id = ${notionId}::uuid
    `);
    expect(new Date(state[0]?.due_at ?? '').toISOString()).toBe(nextDueAt);
  });

  it('CA-5 — même clientAnswerId rejoué une seule fois, autre identifiant en 409', async () => {
    const learner = await createLearner('retry', { notions: 1 });
    await dueState(learner, learner.notionIds[0] as string);
    await reviewBrick(learner, learner.notionIds[0] as string, 'recall_card');
    const session = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
    if (!session.ok) throw session.error;
    const sessionId = session.value.sessionId as string;
    const clientAnswerId = randomUUID();
    const input = {
      position: 0,
      clientAnswerId,
      timeMs: 900,
      response: { selfRating: 'easy' },
    } as const;
    const first = await answerReviewItem(learner.ctx, sessionId, input);
    const second = await answerReviewItem(learner.ctx, sessionId, input);
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) throw new Error('réponse refusée');
    expect(second.value).toEqual(first.value);

    const answerCount = await countRows(sql`
      select count(*)::int as count
      from public.answers a
      join public.attempts at on at.id = a.attempt_id
      where at.user_id = ${learner.userId}::uuid and a.position = 1
    `);
    expect(answerCount).toBe(1);
    const logCount = await countRows(sql`
      select count(*)::int as count
      from public.review_logs where user_id = ${learner.userId}::uuid
    `);
    expect(logCount).toBe(1);

    const conflict = await answerReviewItem(learner.ctx, sessionId, {
      ...input,
      clientAnswerId: randomUUID(),
    });
    expect(conflict.ok).toBe(false);
    if (!conflict.ok) {
      expect(conflict.error.code).toBe('CONFLICT');
      expect(conflict.error.status).toBe(409);
    }
  });

  it('CA-6 — « Passer » n’écrit aucun journal et laisse la notion due', async () => {
    const learner = await createLearner('skip', { notions: 2 });
    for (const notionId of learner.notionIds) {
      await dueState(learner, notionId);
      await reviewBrick(learner, notionId);
    }
    const session = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
    if (!session.ok) throw session.error;
    const sessionId = session.value.sessionId as string;
    const skipped = await answerReviewItem(learner.ctx, sessionId, {
      position: 0,
      clientAnswerId: randomUUID(),
      timeMs: 0,
      skipped: true,
    });
    expect(skipped.ok).toBe(true);
    const logs = await countRows(sql`
      select count(*)::int as count
      from public.review_logs where user_id = ${learner.userId}::uuid
    `);
    expect(logs).toBe(0);
    const stillDue = await countRows(sql`
      select count(*)::int as count
      from public.notion_states
      where user_id = ${learner.userId}::uuid and in_review and due_at <= '2026-11-11T23:59:59Z'::timestamptz
    `);
    expect(stillDue).toBe(2);

    const completed = await completeReviewSession(learner.ctx, sessionId);
    expect(completed.ok).toBe(true);
    if (!completed.ok) throw completed.error;
    expect(completed.value.reviewedCount).toBe(2);
    expect(completed.value.okCount).toBe(0);
    expect(completed.value.soonCount).toBe(2);
  });

  it('CA-8 — la clôture rend la journée qualifiante et la série passe de 12 à 13', async () => {
    const learner = await createLearner('streak', { notions: 2 });
    for (const notionId of learner.notionIds) {
      await dueState(learner, notionId);
      await reviewBrick(learner, notionId);
    }
    await serviceDb().execute(sql`
      update public.profiles
      set streak_days = 12, streak_computed_on = '2026-11-10'::date
      where id = ${learner.userId}::uuid
    `);
    await serviceDb().execute(sql`
      insert into public.daily_activity (user_id, day, minutes, qualifying, sources)
      values (${learner.userId}::uuid, '2026-11-10'::date, 110, true, '{attempts}'::text[])
      on conflict (user_id, day) do update set qualifying = true
    `);

    const session = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
    if (!session.ok) throw session.error;
    const sessionId = session.value.sessionId as string;
    const first = session.value.items[0];
    if (first === undefined) throw new Error('item de test absent');
    const answered = await answerReviewItem(learner.ctx, sessionId, {
      position: 0,
      clientAnswerId: randomUUID(),
      timeMs: 540_000,
      response: { optionIds: ['a'] },
    });
    expect(answered.ok).toBe(true);

    const completed = await completeReviewSession(learner.ctx, sessionId);
    expect(completed.ok).toBe(true);
    if (!completed.ok) throw completed.error;
    expect(completed.value.minutes).toBe(9);
    expect(completed.value.streakDays).toBe(13);
    expect(completed.value.nextSessionAt).toBeNull();

    const daily = await serviceDb().execute<{ qualifying: boolean; minutes: number }>(sql`
      select qualifying, minutes from public.daily_activity
      where user_id = ${learner.userId}::uuid and day = '2026-11-11'::date
    `);
    expect(daily[0]?.qualifying).toBe(true);

    const replay = await completeReviewSession(learner.ctx, sessionId);
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw replay.error;
    expect(replay.value).toEqual(completed.value);
  });

  it('CL-2 — une session de la veille est close à l’ouverture du jour', async () => {
    const learner = await createLearner('stale', { notions: 1 });
    const notionId = learner.notionIds[0] as string;
    await dueState(learner, notionId);
    const brick = await reviewBrick(learner, notionId, 'recall_card');
    const moduleId = learner.moduleIds[0] as string;

    const activityId = randomUUID();
    const attemptId = randomUUID();
    const config = {
      mode: 'full',
      forDate: '2026-11-10',
      dueCount: 1,
      deferredCount: 0,
      deferredTo: '2026-11-11',
      capMinutes: 15,
      estimatedSec: 30,
      rationale: [],
      items: [
        {
          position: 0,
          format: 'recall_card',
          reasonKey: null,
          displayLabel: 'Variante d’exercice',
          moduleIds: [moduleId],
          notionIds: [notionId],
        },
      ],
    };
    await serviceDb().execute(sql`
      insert into public.activities
        (id, owner_id, formation_id, module_id, kind, config, items, status, for_date, created_at)
      values (
        ${activityId}::uuid, ${learner.userId}::uuid, ${learner.formationId}::uuid, ${moduleId}::uuid,
        'global_quiz_session'::public.activity_kind, ${JSON.stringify(config)}::jsonb,
        ${JSON.stringify([{ brickId: brick.brickId, brickVersionId: brick.versionId }])}::jsonb,
        'ready', '2026-11-10'::date, '2026-11-10T17:00:00Z'::timestamptz
      )
    `);
    await serviceDb().execute(sql`
      insert into public.attempts (id, user_id, activity_id, attempt_no, status, started_at, created_at)
      values (
        ${attemptId}::uuid, ${learner.userId}::uuid, ${activityId}::uuid, 1, 'in_progress',
        '2026-11-10T17:00:00Z'::timestamptz, '2026-11-10T17:00:00Z'::timestamptz
      )
    `);

    const session = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
    expect(session.ok).toBe(true);
    if (!session.ok) throw session.error;
    expect(session.value.forDate).toBe('2026-11-11');
    expect(session.value.sessionId).not.toBe(activityId);

    const stale = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.attempts where id = ${attemptId}::uuid
    `);
    expect(stale[0]?.status).toBe('abandoned');
    const skipped = await countRows(sql`
      select count(*)::int as count
      from public.answers where attempt_id = ${attemptId}::uuid and response->>'skipped' = 'true'
    `);
    expect(skipped).toBe(1);
  });

  it('CL-7 — banque épuisée : la notion sort du jour et un remplissage est demandé', async () => {
    const learner = await createLearner('refill', { notions: 1 });
    const notionId = learner.notionIds[0] as string;
    await dueState(learner, notionId);
    const brick = await reviewBrick(learner, notionId, 'choice_question');

    const activityId = randomUUID();
    const attemptId = randomUUID();
    await serviceDb().execute(sql`
      insert into public.activities
        (id, owner_id, formation_id, module_id, kind, config, items, status, for_date, created_at)
      values (
        ${activityId}::uuid, ${learner.userId}::uuid, ${learner.formationId}::uuid,
        ${learner.moduleIds[0] ?? null}::uuid, 'warmup'::public.activity_kind, '{}'::jsonb,
        ${JSON.stringify([{ brickId: brick.brickId, brickVersionId: brick.versionId }])}::jsonb,
        'ready', '2026-11-11'::date, '2026-11-11T08:00:00Z'::timestamptz
      )
    `);
    await serviceDb().execute(sql`
      insert into public.attempts (id, user_id, activity_id, attempt_no, status, started_at, created_at)
      values (
        ${attemptId}::uuid, ${learner.userId}::uuid, ${activityId}::uuid, 1, 'graded',
        '2026-11-11T08:00:00Z'::timestamptz, '2026-11-11T08:00:00Z'::timestamptz
      )
    `);
    await serviceDb().execute(sql`
      insert into public.answers
        (attempt_id, brick_version_id, position, response, is_correct, time_ms, graded_by, answered_at)
      values (
        ${attemptId}::uuid, ${brick.versionId}::uuid, 1, '{"optionIds":["a"]}'::jsonb, true, 1000,
        'code', '2026-11-11T08:01:00Z'::timestamptz
      )
    `);

    const session = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
    expect(session.ok).toBe(true);
    if (!session.ok) throw session.error;
    expect(session.value.status).toBe('empty');
    expect(session.value.items).toHaveLength(0);

    const jobs = await serviceDb().execute<{ reason: string; format: string }>(sql`
      select reason, format::text as format from public.question_bank_jobs
      where user_id = ${learner.userId}::uuid and notion_id = ${notionId}::uuid
    `);
    expect(jobs[0]).toMatchObject({ reason: 'exhaustion', format: 'choice_question' });
    const stillDue = await countRows(sql`
      select count(*)::int as count from public.notion_states
      where user_id = ${learner.userId}::uuid and notion_id = ${notionId}::uuid and in_review
    `);
    expect(stillDue).toBe(1);
  });

  it('ET-12 — un autre apprenant reçoit 404 sur la formation', async () => {
    const owner = await createLearner('rls-owner', { notions: 1 });
    await dueState(owner, owner.notionIds[0] as string);
    await reviewBrick(owner, owner.notionIds[0] as string);
    const stranger = await createLearner('rls-stranger', { notions: 1 });

    const result = await getOrCreateTodaySession(stranger.ctx, owner.formationId, 'full');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe('NOT_FOUND');
  });
});
