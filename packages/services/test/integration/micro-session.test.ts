// Integration tests of the micro-session (SPEC-703 §12, CA-2 to CA-6, CL-6).
//
// Postgres is real: the session of the day is created under the consultative lock, the answers
// update FSRS with `review_logs.source = 'micro_session'`, the closure qualifies the day and the
// `review/session-completed` event is captured by the test Inngest sender after commit. Each
// learner gets its own programme and every account is removed at the end.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestCourse, createTestProgramme, createTestUser } from '@learny/db/testing';
import { setEventSender } from '@learny/jobs';
import {
  createBrick,
  createMicroSessionBricks,
  createNotionState,
  microRecallCardPayload,
} from '@learny/testing';

import { createServiceContext, type ServiceContext } from '../../src/context';
import { answerReviewItem, completeReviewSession, getOrCreateTodaySession } from '../../src/review';

const PREFIX = 'sdd-703-';
const FIXED = new Date('2026-11-11T12:20:00Z');

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

interface CapturedEvent {
  id: string;
  name: string;
  data: Record<string, unknown>;
}

const events: CapturedEvent[] = [];

beforeAll(() => {
  setEventSender({
    send: (batch) => {
      events.push(...batch);
      return Promise.resolve();
    },
  });
});

afterAll(async () => {
  setEventSender(undefined);
  await cleanup();
  await closeDb();
});

async function cleanup(): Promise<void> {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
}

afterEach(async () => {
  await cleanup();
  events.length = 0;
});

interface Learner {
  userId: string;
  email: string;
  formationId: string;
  notionIds: string[];
  labels: Map<string, string>;
  ctx: ServiceContext;
}

async function createLearner(
  label: string,
  options: { notions: number; durationMin?: 3 | 5 | 10 },
): Promise<Learner> {
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
    await createTestCourse(tx, { ownerId: user.id, moduleId });
    await tx.execute(sql`
      update public.modules set status = 'validated' where formation_id = ${programme.formationId}::uuid
    `);
    if (options.durationMin !== undefined) {
      await tx.execute(sql`
        update public.automation_settings
        set params = params || ${JSON.stringify({ durationMin: options.durationMin })}::jsonb
        where user_id = ${user.id}::uuid and key = 'micro_seance'
      `);
    }
    return { user, programme };
  });
  const labels = new Map<string, string>();
  const rows = await serviceDb().execute<{ id: string; label: string }>(sql`
    select id::text as id, label
    from public.notions
    where formation_id = ${base.programme.formationId}::uuid
    order by created_at, id
  `);
  for (const row of rows) labels.set(row.id, row.label);
  return {
    userId: base.user.id,
    email,
    formationId: base.programme.formationId,
    notionIds: base.programme.notionIds,
    labels,
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
  dueAt = '2026-11-11T08:00:00Z',
): Promise<void> {
  await serviceDb().transaction(async (tx) => {
    await createNotionState(tx, {
      userId: learner.userId,
      notionId,
      gapNature: gap,
      mastery: gap === null ? 70 : 45,
      dueAt: new Date(dueAt),
    });
  });
}

/** One recall card on the first notion, one on the second, a question on the next four. */
async function microBricks(learner: Learner): Promise<void> {
  const [first, second] = learner.notionIds;
  if (first === undefined || second === undefined) throw new Error('notions de test absentes');
  await serviceDb().transaction(async (tx) => {
    await createBrick(tx, {
      ownerId: learner.userId,
      formationId: learner.formationId,
      type: 'recall_card',
      purpose: 'review',
      notionIds: [second],
      payload: microRecallCardPayload(
        'Qu’est-ce qu’une société ?',
        'Une entité juridique qui tient sa propre comptabilité.',
      ),
    });
    await createMicroSessionBricks(tx, {
      ownerId: learner.userId,
      formationId: learner.formationId,
      cardNotionId: first,
      questionNotionIds: learner.notionIds.slice(1, 5),
    });
  });
}

function unwrap<T>(result: { ok: true; value: T } | { ok: false; error: unknown }): T {
  if (!result.ok) throw result.error;
  return result.value;
}

describe('[SPEC-703] micro-séance', () => {
  it('CA-2 — D = 5 contient une carte puis une question, créée une seule fois', async () => {
    const learner = await createLearner('cinq', { notions: 5 });
    for (const notionId of learner.notionIds) await dueState(learner, notionId);
    await microBricks(learner);

    const first = unwrap(await getOrCreateTodaySession(learner.ctx, learner.formationId, 'micro'));
    const replay = unwrap(await getOrCreateTodaySession(learner.ctx, learner.formationId, 'micro'));

    expect(first.mode).toBe('micro');
    expect(first.status).toBe('in_progress');
    expect(first.header.estimatedMinutes).toBe(5);
    expect(first.header.notionCount).toBe(5);
    expect(first.items.map((item) => item.type)).toEqual(['recall_card', 'choice_question']);
    expect(first.note).toBe(
      'Version courte de secours : une carte de rappel et une question. Elle garde le rythme et la série les jours chargés.',
    );
    expect(first.rationale[0]).toEqual({
      label: 'Micro-séance',
      text: 'la notion la plus urgente en carte de rappel, puis une question qui en mêle plusieurs.',
    });
    expect(first.modeOptions.microMinutes).toBe(5);
    expect(replay.sessionId).toBe(first.sessionId);

    const activities = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.activities
      where owner_id = ${learner.userId}::uuid and config->>'mode' = 'micro'
    `);
    expect(activities[0]?.count).toBe(1);
  });

  it('CA-2 — D = 10 contient deux cartes puis une question', async () => {
    const learner = await createLearner('dix', { notions: 6, durationMin: 10 });
    for (const notionId of learner.notionIds) await dueState(learner, notionId);
    await microBricks(learner);

    const session = unwrap(
      await getOrCreateTodaySession(learner.ctx, learner.formationId, 'micro'),
    );
    expect(session.header.estimatedMinutes).toBe(10);
    expect(session.items.map((item) => item.type)).toEqual([
      'recall_card',
      'recall_card',
      'choice_question',
    ]);
    expect(session.note).toBe(
      'Version courte de secours : deux cartes de rappel et une question. Elle garde le rythme et la série les jours chargés.',
    );
  });

  it('CA-3 — la carte porte sur la notion en lacune, avant les notions simplement dues', async () => {
    const learner = await createLearner('lacune', { notions: 5 });
    const [first, second] = learner.notionIds;
    if (first === undefined || second === undefined) throw new Error('notions absentes');
    // The first notion is due later; the second carries the gap and must open the micro-session.
    await dueState(learner, first, null, '2026-11-11T06:00:00Z');
    await dueState(learner, second, 'forgetting', '2026-11-11T10:00:00Z');
    for (const notionId of learner.notionIds.slice(2)) await dueState(learner, notionId);
    await microBricks(learner);

    const session = unwrap(
      await getOrCreateTodaySession(learner.ctx, learner.formationId, 'micro'),
    );
    expect(session.items[0]?.type).toBe('recall_card');
    expect(session.items[0]?.notionIds).toEqual([second]);
    expect(session.items[0]?.reason).toBe('Choisi pour votre oubli');
    expect(session.rationale.at(-1)?.label).toBe('Lacune en priorité');
  });

  it('CA-4, CA-5 — les réponses utilisent micro_session, la clôture qualifie le jour et émet l’événement', async () => {
    const learner = await createLearner('cloture', { notions: 5 });
    for (const notionId of learner.notionIds) await dueState(learner, notionId);
    await microBricks(learner);
    const session = unwrap(
      await getOrCreateTodaySession(learner.ctx, learner.formationId, 'micro'),
    );

    const answered = unwrap(
      await answerReviewItem(learner.ctx, session.sessionId ?? '', {
        position: 0,
        clientAnswerId: randomUUID(),
        timeMs: 60_000,
        response: { selfRating: 'good' },
      }),
    );
    expect(answered.isCorrect).toBe(true);

    const sources = await serviceDb().execute<{ source: string }>(sql`
      select distinct rl.source::text as source
      from public.review_logs rl
      join public.answers a on a.id = rl.answer_id
      where a.attempt_id = ${session.attemptId ?? ''}::uuid
    `);
    expect(sources.map((row) => row.source)).toEqual(['micro_session']);

    const summary = unwrap(await completeReviewSession(learner.ctx, session.sessionId ?? ''));
    expect(summary.reviewedCount).toBe(5);

    const daily = await serviceDb().execute<{ qualifying: boolean; sources: string[] }>(sql`
      select qualifying, sources from public.daily_activity
      where user_id = ${learner.userId}::uuid and day = '2026-11-11'::date
    `);
    expect(daily[0]?.qualifying).toBe(true);
    expect(daily[0]?.sources).toContain('micro_session');

    const completed = events.filter((event) => event.name === 'review/session-completed');
    expect(completed).toHaveLength(1);
    expect(completed[0]?.data).toMatchObject({
      userId: learner.userId,
      formationId: learner.formationId,
      sessionId: session.sessionId,
      mode: 'micro',
      forDate: '2026-11-11',
      reviewedCount: 5,
    });
  });

  it('CA-6 — les deux sessions du jour coexistent et gardent leur état', async () => {
    const learner = await createLearner('coexistence', { notions: 5 });
    for (const notionId of learner.notionIds) await dueState(learner, notionId);
    await microBricks(learner);

    const full = unwrap(await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full'));
    const card = full.items.find((item) => item.type === 'recall_card') ?? full.items[0];
    if (card === undefined) throw new Error('jeu complet absent');
    unwrap(
      await answerReviewItem(learner.ctx, full.sessionId ?? '', {
        position: card.position,
        clientAnswerId: randomUUID(),
        timeMs: 30_000,
        response: { selfRating: 'good' },
      }),
    );

    const micro = unwrap(await getOrCreateTodaySession(learner.ctx, learner.formationId, 'micro'));
    expect(micro.sessionId).not.toBe(full.sessionId);
    expect(micro.items[0]?.state).toBe('todo');

    const fullAgain = unwrap(
      await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full'),
    );
    expect(fullAgain.sessionId).toBe(full.sessionId);
    expect(fullAgain.items.find((item) => item.position === card.position)?.state).toBe('answered');
  });

  it('CL-6 — une durée modifiée en cours de journée ne change pas la session créée', async () => {
    const learner = await createLearner('duree', { notions: 5 });
    for (const notionId of learner.notionIds) await dueState(learner, notionId);
    await microBricks(learner);

    const micro = unwrap(await getOrCreateTodaySession(learner.ctx, learner.formationId, 'micro'));
    await serviceDb().transaction(async (tx) => {
      await tx.execute(sql`
        update public.automation_settings
        set params = params || '{"durationMin":10}'::jsonb
        where user_id = ${learner.userId}::uuid and key = 'micro_seance'
      `);
    });
    const replay = unwrap(await getOrCreateTodaySession(learner.ctx, learner.formationId, 'micro'));
    expect(replay.sessionId).toBe(micro.sessionId);
    expect(replay.header.estimatedMinutes).toBe(5);
    expect(replay.modeOptions.microMinutes).toBe(5);

    const full = unwrap(await getOrCreateTodaySession(learner.ctx, learner.formationId, 'full'));
    expect(full.modeOptions.microMinutes).toBe(5);
  });
});
