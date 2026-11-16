// Integration test of the offline synchronisation (SPEC-801 §12, CA-4 to CA-6): application of a
// queued answer with `source = 'offline'`, idempotent replay, conflict on an answered position,
// EXPIRED after seven days, FORBIDDEN on another learner's session and the daily activity of the
// answered day. Postgres is real; each learner is removed at the end.
import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

import type { OfflineEntry } from '@learny/contracts';
import type { Clock } from '@learny/core';
import { closeDb, serviceDb } from '@learny/db';
import { createTestCourse, createTestProgramme, createTestUser } from '@learny/db/testing';
import { createNotionState } from '@learny/testing';

import { createBrick } from '../../src/bricks';
import { createServiceContext, type ServiceContext } from '../../src/context';
import { syncOfflineAnswers } from '../../src/offline';
import { answerReviewItem, getOrCreateTodaySession } from '../../src/review';

const PREFIX = 'sdd-801-sync-';
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

afterEach(cleanup);
afterAll(async () => {
  await cleanup();
  await closeDb();
});

const RECALL = {
  front: 'Que définit une variante d’exercice comptable ?',
  back: 'Le nombre de périodes comptables d’un exercice.',
  sourceLabel: 'votre cours du module 1',
  sources: [],
};

async function createLearner(notions: number): Promise<Learner> {
  const email = `${PREFIX}${randomUUID().slice(0, 8)}@test.learny.test`;
  const base = await serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email, timezone: 'Europe/Paris' });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: notions,
      title: 'SAP S/4HANA Finance',
    });
    const moduleId = programme.moduleIds[0];
    if (moduleId === undefined) throw new Error('module absent');
    await createTestCourse(tx, { ownerId: user.id, moduleId });
    await tx.execute(
      sql`update public.modules set status = 'validated' where formation_id = ${programme.formationId}::uuid`,
    );
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

async function prepare(learner: Learner): Promise<string> {
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
      type: 'recall_card',
      formationId: learner.formationId,
      purpose: 'review',
      origin: 'tutor',
      notionIds: [notionId],
      payload: RECALL,
      createdBy: 'tutor',
    });
    if (!created.ok) throw created.error;
  }
  const session = await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full');
  if (!session.ok) throw session.error;
  if (session.value.sessionId === null) throw new Error('session absente');
  return session.value.sessionId;
}

function entry(
  learner: Learner,
  sessionId: string,
  position: number,
  overrides: Partial<OfflineEntry> = {},
): OfflineEntry {
  return {
    clientId: randomUUID(),
    kind: 'answer',
    formationId: learner.formationId,
    sessionId,
    position,
    answeredAt: '2026-11-11T10:00:00.000Z',
    response: { selfRating: 'good' },
    ...overrides,
  };
}

async function countOf(statement: ReturnType<typeof sql>): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(
    sql`select count(*)::int as count from (${statement}) q`,
  );
  return rows[0]?.count ?? 0;
}

describe('[SPEC-801] synchronisation hors ligne', () => {
  it('applique une réponse avec source offline et crédite le jour local (CA-4)', async () => {
    const learner = await createLearner(2);
    const sessionId = await prepare(learner);
    const queued = entry(learner, sessionId, 1);
    const result = await syncOfflineAnswers(learner.ctx, [queued]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.results[0]?.status).toBe('applied');
    expect(result.value.results[0]?.correct).toBe(true);

    const logs = await serviceDb().execute<{ source: string; reviewed_at: string }>(sql`
      select source::text as source, reviewed_at::text as reviewed_at
      from public.review_logs
      where user_id = ${learner.userId}::uuid
    `);
    expect(logs.some((log) => log.source === 'offline')).toBe(true);
    const activity = await serviceDb().execute<{ minutes: number; qualifying: boolean }>(sql`
      select minutes, qualifying from public.daily_activity
      where user_id = ${learner.userId}::uuid and day = '2026-11-11'::date
    `);
    expect(activity[0]?.qualifying).toBe(true);
    expect(activity[0]?.minutes ?? 0).toBeGreaterThan(0);
  });

  it('rejoue un lot en duplicate sans créer de ligne (CA-5)', async () => {
    const learner = await createLearner(1);
    const sessionId = await prepare(learner);
    const queued = entry(learner, sessionId, 0);
    const first = await syncOfflineAnswers(learner.ctx, [queued]);
    expect(first.ok).toBe(true);
    const answers = await countOf(
      sql`select 1 from public.answers a join public.attempts at on at.id = a.attempt_id where at.user_id = ${learner.userId}::uuid`,
    );
    const logs = await countOf(
      sql`select 1 from public.review_logs where user_id = ${learner.userId}::uuid`,
    );
    const replay = await syncOfflineAnswers(learner.ctx, [queued]);
    expect(replay.ok).toBe(true);
    if (!replay.ok) throw replay.error;
    expect(replay.value.results[0]?.status).toBe('duplicate');
    expect(
      await countOf(
        sql`select 1 from public.answers a join public.attempts at on at.id = a.attempt_id where at.user_id = ${learner.userId}::uuid`,
      ),
    ).toBe(answers);
    expect(
      await countOf(sql`select 1 from public.review_logs where user_id = ${learner.userId}::uuid`),
    ).toBe(logs);
  });

  it('signale un conflit sur une position déjà répondue en ligne (CA-6)', async () => {
    const learner = await createLearner(1);
    const sessionId = await prepare(learner);
    const online = await answerReviewItem(learner.ctx, sessionId, {
      position: 0,
      clientAnswerId: randomUUID(),
      timeMs: 3000,
      response: { selfRating: 'good' },
    });
    expect(online.ok).toBe(true);
    const result = await syncOfflineAnswers(learner.ctx, [entry(learner, sessionId, 0)]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.results[0]).toMatchObject({ status: 'conflict' });
  });

  it('rejette une réponse de plus de sept jours avec EXPIRED (CA-6)', async () => {
    const learner = await createLearner(1);
    const sessionId = await prepare(learner);
    const result = await syncOfflineAnswers(learner.ctx, [
      entry(learner, sessionId, 0, { answeredAt: '2026-11-01T10:00:00.000Z' }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.results[0]).toMatchObject({ status: 'rejected', code: 'EXPIRED' });
  });

  it('rejette FORBIDDEN la session d’un autre apprenant', async () => {
    const owner = await createLearner(1);
    const ownerSession = await prepare(owner);
    const intruder = await createLearner(1);
    const result = await syncOfflineAnswers(intruder.ctx, [entry(intruder, ownerSession, 0)]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.results[0]).toMatchObject({ status: 'rejected', code: 'FORBIDDEN' });
  });

  it('traite chaque entrée indépendamment (CL-11)', async () => {
    const learner = await createLearner(2);
    const sessionId = await prepare(learner);
    const result = await syncOfflineAnswers(learner.ctx, [
      entry(learner, sessionId, 0),
      entry(learner, sessionId, 1, { answeredAt: '2026-10-01T10:00:00.000Z' }),
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    // Processed in answeredAt order: the ancient entry comes first.
    expect(result.value.results.map((item) => item.status)).toEqual(['rejected', 'applied']);
  });
});
