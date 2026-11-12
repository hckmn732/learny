// Integration tests of the learning persistence services (SPEC-411 §12, CA-1 to CA-4).
//
// Postgres is real: RLS, the partial unique index of `review_logs`, the security-definer append
// functions and the row locks are exercised. Users and their programme are committed because the
// concurrency and two-learner tests need several connections; every account is removed afterwards.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AppError, type Clock } from '@learny/core';
import { createGroup, joinGroup, serviceDb, sql, type Db } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { setEventSender } from '@learny/jobs';
import { createNotionCard } from '@learny/learning-engine';
import { createBrick } from '@learny/testing';

import { createServiceContext } from '../../src/context';
import {
  applyLearningResult,
  getDueNotions,
  persistPlan,
  toPersistenceCard,
} from '../../src/learning';

const PREFIX = 'sdd-411-';
const NOW = new Date('2026-11-11T12:20:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

class TestClock implements Clock {
  now(): Date {
    return new Date(NOW);
  }
}

interface CapturedEvent {
  id: string;
  name: string;
  data: Record<string, unknown>;
}

let sent: CapturedEvent[] = [];

beforeEach(() => {
  sent = [];
  setEventSender({
    send: (events) => {
      sent.push(...(events as CapturedEvent[]));
      return Promise.resolve({ ids: events.map((event) => event.id) });
    },
  });
});

afterEach(() => {
  setEventSender(undefined);
});

afterAll(async () => {
  await cleanup();
});

async function cleanup(): Promise<void> {
  await serviceDb().execute(sql`
    delete from public.groups
    where owner_id in (
      select id from public.profiles where email like ${`${PREFIX}%@test.learny.test`}
    )
  `);
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
}

async function createUser(label: string): Promise<string> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => (await createTestUser(tx, { email })).id);
}

interface Programme {
  formationId: string;
  moduleId: string;
  notionIds: string[];
}

async function createProgramme(userId: string, notions = 2): Promise<Programme> {
  return serviceDb().transaction(async (tx) => {
    const programme = await createTestProgramme(tx, userId, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: notions,
    });
    return {
      formationId: programme.formationId,
      moduleId: programme.moduleIds[0] as string,
      notionIds: programme.notionIds,
    };
  });
}

interface AttemptAnswer {
  notionId: string;
  correct: boolean;
  timeMs?: number;
  score?: number;
  chosenDistractorNotionId?: string | null;
  answeredAt: Date;
}

interface AttemptFixture {
  attemptId: string;
  activityId: string;
  brickIds: string[];
}

async function createGradedAttempt(
  db: Db,
  input: {
    userId: string;
    formationId: string;
    moduleId: string;
    answers: readonly AttemptAnswer[];
    attemptNo?: number;
    durationMs?: number;
    submittedAt?: Date;
  },
): Promise<AttemptFixture> {
  return db.transaction(async (tx) => {
    const bricks: { id: string; versionId: string }[] = [];
    for (const answer of input.answers) {
      const brick = await createBrick(tx, {
        ownerId: input.userId,
        formationId: input.formationId,
        type: 'choice_question',
        notionIds: [answer.notionId],
      });
      bricks.push(brick);
    }
    const items = bricks.map((brick) => ({
      brickId: brick.id,
      brickVersionId: brick.versionId,
      points: 1,
    }));
    const [activity] = await tx.execute<{ id: string }>(sql`
      insert into public.activities (
        owner_id, formation_id, module_id, kind, config, items, status, for_date
      ) values (
        ${input.userId}::uuid, ${input.formationId}::uuid, ${input.moduleId}::uuid,
        'validation_quiz', '{}'::jsonb, ${JSON.stringify(items)}::jsonb, 'ready', '2026-11-11'
      )
      returning id::text as id
    `);
    if (activity === undefined) throw new Error('activité non créée');
    const attemptNo = input.attemptNo ?? 1;
    const submittedAt = (input.submittedAt ?? NOW).toISOString();
    const [attempt] = await tx.execute<{ id: string }>(sql`
      insert into public.attempts (
        user_id, activity_id, attempt_no, status, started_at, submitted_at, duration_ms,
        score, passed, per_notion, hints_used
      ) values (
        ${input.userId}::uuid, ${activity.id}::uuid, ${attemptNo}, 'graded',
        ${submittedAt}::timestamptz, ${submittedAt}::timestamptz, ${input.durationMs ?? 60_000},
        80, true, '{}'::jsonb, 0
      )
      returning id::text as id
    `);
    if (attempt === undefined) throw new Error('tentative non créée');
    for (const [index, answer] of input.answers.entries()) {
      const brick = bricks[index];
      if (brick === undefined) throw new Error('brique absente');
      const score = answer.score ?? (answer.correct ? 100 : 0);
      await tx.execute(sql`
        insert into public.answers (
          attempt_id, brick_version_id, position, response, is_correct, score, max_score,
          time_ms, graded_by, feedback, chosen_distractor_notion_id, answered_at
        ) values (
          ${attempt.id}::uuid,
          ${brick.versionId}::uuid,
          ${index + 1},
          '{}'::jsonb,
          ${answer.correct},
          ${score},
          100,
          ${answer.timeMs ?? 5000},
          'code',
          '{}'::jsonb,
          ${answer.chosenDistractorNotionId ?? null}::uuid,
          ${answer.answeredAt.toISOString()}::timestamptz
        )
      `);
    }
    return {
      attemptId: attempt.id,
      activityId: activity.id,
      brickIds: bricks.map((brick) => brick.id),
    };
  });
}

function context(userId: string) {
  return createServiceContext({
    userId,
    requestId: `sdd-411-${randomUUID().slice(0, 8)}`,
    clock: new TestClock(),
  });
}

async function count(table: string, userId: string): Promise<number> {
  const rows = await serviceDb().execute<{ count: string }>(sql`
    select count(*)::int as count from public.${sql.raw(table)} where user_id = ${userId}::uuid
  `);
  return Number(rows[0]?.count ?? '0');
}

async function revisions(userId: string): Promise<Record<string, number>> {
  const rows = await serviceDb().execute<{ notion_id: string; revision: number }>(sql`
    select notion_id::text as notion_id, revision
    from public.notion_states
    where user_id = ${userId}::uuid
    order by notion_id
  `);
  return Object.fromEntries(rows.map((row) => [row.notion_id, row.revision]));
}

describe('[SPEC-411] transaction RLS', () => {
  it('applique deux notions une seule fois et ne change aucun compte au second appel (CA-1)', async () => {
    const userId = await createUser('double');
    const programme = await createProgramme(userId);
    const [first, second] = programme.notionIds;
    if (first === undefined || second === undefined) throw new Error('notions absentes');
    const fixture = await createGradedAttempt(serviceDb(), {
      userId,
      formationId: programme.formationId,
      moduleId: programme.moduleId,
      answers: [
        {
          notionId: first,
          correct: true,
          timeMs: 4000,
          answeredAt: new Date(NOW.getTime() - 5 * 60_000),
        },
        {
          notionId: second,
          correct: true,
          timeMs: 6000,
          answeredAt: new Date(NOW.getTime() - 4 * 60_000),
        },
      ],
      durationMs: 10_000,
    });

    const firstCall = await applyLearningResult(context(userId), fixture.attemptId);
    expect(firstCall.ok).toBe(true);
    if (!firstCall.ok) return;
    expect(firstCall.value.status).toBe('applied');
    expect(firstCall.value.reviewCount).toBe(2);
    expect(firstCall.value.states).toHaveLength(2);
    expect(firstCall.value.dailyActivity?.minutes).toBe(1);
    expect(await count('review_logs', userId)).toBe(2);
    expect(await count('notion_states', userId)).toBe(2);
    expect(await count('daily_activity', userId)).toBe(1);
    expect(await count('gap_events', userId)).toBe(0);
    const before = await revisions(userId);

    const secondCall = await applyLearningResult(context(userId), fixture.attemptId);
    expect(secondCall.ok).toBe(true);
    if (!secondCall.ok) return;
    expect(secondCall.value.status).toBe('already_applied');
    expect(secondCall.value.reviewCount).toBe(0);
    expect(await count('review_logs', userId)).toBe(2);
    expect(await count('notion_states', userId)).toBe(2);
    const daily = await serviceDb().execute<{ minutes: number }>(sql`
      select minutes from public.daily_activity where user_id = ${userId}::uuid
    `);
    expect(daily[0]?.minutes).toBe(1);
    expect(await revisions(userId)).toEqual(before);
  });

  it('crée exactement une lacune et un événement après commit (CA-2)', async () => {
    const userId = await createUser('gap');
    const programme = await createProgramme(userId, 1);
    const notion = programme.notionIds[0] as string;
    const fixture = await createGradedAttempt(serviceDb(), {
      userId,
      formationId: programme.formationId,
      moduleId: programme.moduleId,
      answers: [
        {
          notionId: notion,
          correct: false,
          score: 0,
          answeredAt: new Date(NOW.getTime() - 3 * 60_000),
        },
      ],
    });

    const result = await applyLearningResult(context(userId), fixture.attemptId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.gapEvents).toEqual([
      { notionId: notion, kind: 'detected', nature: 'misunderstanding' },
    ]);
    expect(await count('gap_events', userId)).toBe(1);
    expect(sent.filter((event) => event.name === 'gap/detected')).toHaveLength(1);
    const outbox = await serviceDb().execute<{ name: string; data: Record<string, unknown> }>(sql`
      select name, data from public.event_outbox where user_id = ${userId}::uuid
    `);
    expect(outbox.map((row) => row.name)).toEqual(['gap/detected']);
    expect(outbox[0]?.data).toMatchObject({ notionId: notion, nature: 'misunderstanding' });
  });

  it('lève une lacune et émet un seul événement cleared (CA-2)', async () => {
    const userId = await createUser('cleared');
    const programme = await createProgramme(userId, 1);
    const notion = programme.notionIds[0] as string;
    await createGradedAttempt(serviceDb(), {
      userId,
      formationId: programme.formationId,
      moduleId: programme.moduleId,
      answers: [
        { notionId: notion, correct: true, answeredAt: new Date(NOW.getTime() - 3 * DAY) },
        { notionId: notion, correct: true, answeredAt: new Date(NOW.getTime() - DAY) },
      ],
      attemptNo: 1,
      submittedAt: new Date(NOW.getTime() - DAY),
    });
    const card = toPersistenceCard(
      createNotionCard(new Date(NOW.getTime() - DAY).toISOString(), 0.9),
    );
    await serviceDb().execute(sql`
      insert into public.notion_states (
        user_id, notion_id, fsrs, due_at, mastery, first_seen_at, last_seen_at, success_count,
        gap_nature, gap_detected_at, gap_evidence, in_review, revision
      ) values (
        ${userId}::uuid, ${notion}::uuid, ${JSON.stringify(card)}::jsonb,
        ${new Date(NOW.getTime() - DAY).toISOString()}::timestamptz, 100,
        ${new Date(NOW.getTime() - 3 * DAY).toISOString()}::timestamptz,
        ${new Date(NOW.getTime() - DAY).toISOString()}::timestamptz, 2,
        'forgetting', ${new Date(NOW.getTime() - 5 * DAY).toISOString()}::timestamptz,
        'ancienne lacune', true, 3
      )
      on conflict (user_id, notion_id) do nothing
    `);
    const fixture = await createGradedAttempt(serviceDb(), {
      userId,
      formationId: programme.formationId,
      moduleId: programme.moduleId,
      answers: [{ notionId: notion, correct: true, answeredAt: NOW }],
      attemptNo: 2,
    });

    const result = await applyLearningResult(context(userId), fixture.attemptId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.gapEvents).toEqual([
      { notionId: notion, kind: 'cleared', nature: 'forgetting' },
    ]);
    expect(await count('gap_events', userId)).toBe(1);
    expect(sent.filter((event) => event.name === 'gap/cleared')).toHaveLength(1);
    const states = await serviceDb().execute<{ gap_cleared_at: Date | null }>(sql`
      select gap_cleared_at from public.notion_states
      where user_id = ${userId}::uuid and notion_id = ${notion}::uuid
    `);
    expect(states[0]?.gap_cleared_at).not.toBeNull();
  });

  it('annule toutes les écritures quand une erreur survient au milieu (CA-3)', async () => {
    const userId = await createUser('rollback');
    const programme = await createProgramme(userId);
    const [first, second] = programme.notionIds;
    if (first === undefined || second === undefined) throw new Error('notions absentes');
    const fixture = await createGradedAttempt(serviceDb(), {
      userId,
      formationId: programme.formationId,
      moduleId: programme.moduleId,
      answers: [
        { notionId: first, correct: true, answeredAt: new Date(NOW.getTime() - 2 * 60_000) },
        { notionId: second, correct: true, answeredAt: new Date(NOW.getTime() - 60_000) },
      ],
    });

    await expect(
      applyLearningResult(context(userId), fixture.attemptId, {
        hooks: {
          afterNotion: () => {
            throw new Error('forced rollback');
          },
        },
      }),
    ).rejects.toThrow('forced rollback');

    expect(await count('review_logs', userId)).toBe(0);
    expect(await count('notion_states', userId)).toBe(0);
    expect(await count('daily_activity', userId)).toBe(0);
    expect(await count('gap_events', userId)).toBe(0);
    const outbox = await serviceDb().execute<{ count: string }>(sql`
      select count(*)::int as count from public.event_outbox where user_id = ${userId}::uuid
    `);
    expect(Number(outbox[0]?.count ?? '0')).toBe(0);
  });

  it('sérialise deux applications simultanées et ne journalise qu’une fois (CA-1, CL-1)', async () => {
    const userId = await createUser('concurrent');
    const programme = await createProgramme(userId);
    const notion = programme.notionIds[0] as string;
    const fixture = await createGradedAttempt(serviceDb(), {
      userId,
      formationId: programme.formationId,
      moduleId: programme.moduleId,
      answers: [{ notionId: notion, correct: true, answeredAt: new Date(NOW.getTime() - 60_000) }],
    });

    const [left, right] = await Promise.all([
      applyLearningResult(context(userId), fixture.attemptId),
      applyLearningResult(context(userId), fixture.attemptId),
    ]);
    const statuses = [left, right].map((result) => (result.ok ? result.value.status : 'error'));
    expect(statuses.sort()).toEqual(['already_applied', 'applied']);
    expect(await count('review_logs', userId)).toBe(1);
    expect(await count('notion_states', userId)).toBe(1);
    expect(await count('daily_activity', userId)).toBe(1);
    const state = await serviceDb().execute<{ revision: number }>(sql`
      select revision from public.notion_states where user_id = ${userId}::uuid
    `);
    expect(state[0]?.revision).toBe(1);
  });

  it('isole deux membres d’une même formation partagée (CA-4)', async () => {
    const ownerId = await createUser('owner');
    const memberId = await createUser('member');
    const programme = await createProgramme(ownerId, 1);
    const notion = programme.notionIds[0] as string;
    await serviceDb().transaction(async (tx) => {
      const group = await createGroup(tx, {
        formationId: programme.formationId,
        ownerId,
        now: NOW,
      });
      await joinGroup(tx, { inviteCode: group.inviteCode, userId: memberId, now: NOW });
    });

    const ownerAttempt = await createGradedAttempt(serviceDb(), {
      userId: ownerId,
      formationId: programme.formationId,
      moduleId: programme.moduleId,
      answers: [{ notionId: notion, correct: true, answeredAt: new Date(NOW.getTime() - 60_000) }],
    });
    const ownerResult = await applyLearningResult(context(ownerId), ownerAttempt.attemptId);
    expect(ownerResult.ok).toBe(true);
    await serviceDb().execute(sql`
      update public.notion_states
      set due_at = ${new Date(NOW.getTime() - 60_000).toISOString()}::timestamptz
      where user_id = ${ownerId}::uuid and notion_id = ${notion}::uuid
    `);

    const ownerDue = await getDueNotions(context(ownerId), programme.formationId, NOW);
    expect(ownerDue.ok).toBe(true);
    if (ownerDue.ok) {
      expect(ownerDue.value.notions.map((item) => item.notionId)).toEqual([notion]);
    }
    const memberDue = await getDueNotions(context(memberId), programme.formationId, NOW);
    expect(memberDue.ok).toBe(true);
    if (memberDue.ok) expect(memberDue.value.notions).toEqual([]);

    const denied = await applyLearningResult(context(memberId), ownerAttempt.attemptId);
    expect(denied.ok).toBe(false);
    if (!denied.ok) {
      expect(denied.error).toBeInstanceOf(AppError);
      expect(denied.error.code).toBe('NOT_FOUND');
    }

    const memberAttempt = await createGradedAttempt(serviceDb(), {
      userId: memberId,
      formationId: programme.formationId,
      moduleId: programme.moduleId,
      answers: [{ notionId: notion, correct: false, answeredAt: new Date(NOW.getTime() - 30_000) }],
    });
    const memberResult = await applyLearningResult(context(memberId), memberAttempt.attemptId);
    expect(memberResult.ok).toBe(true);
    if (memberResult.ok) {
      expect(memberResult.value.states[0]?.notionId).toBe(notion);
      expect(memberResult.value.states[0]?.masteryAfter).toBe(0);
    }
    const rows = await serviceDb().execute<{ user_id: string; mastery: string }>(sql`
      select user_id::text as user_id, mastery::text as mastery
      from public.notion_states
      where notion_id = ${notion}::uuid
      order by user_id
    `);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.user_id))).toEqual(new Set([ownerId, memberId]));
    expect(rows.find((row) => row.user_id === ownerId)?.mastery).not.toBe('0.00');
  });

  it('conserve les créneaux terminés et manuels lors d’une replanification (CA-4)', async () => {
    const userId = await createUser('plan');
    const programme = await createProgramme(userId, 1);
    const base = new Date(NOW.getTime() + DAY);
    const slot = (slotId: string, offsetHours: number, title: string) => ({
      slotId,
      formationId: programme.formationId,
      moduleId: programme.moduleId,
      kind: 'course' as const,
      title,
      startsAt: new Date(base.getTime() + offsetHours * HOUR).toISOString(),
      endsAt: new Date(base.getTime() + (offsetHours + 1) * HOUR).toISOString(),
      status: 'planned' as const,
      createdBy: 'planner' as const,
      movedFromId: null,
    });
    const ctx = context(userId);
    const first = await persistPlan(
      ctx,
      programme.formationId,
      [slot('slot-a', 0, 'Cours A'), slot('slot-b', 2, 'Cours B'), slot('slot-c', 4, 'Cours C')],
      'rev-1',
    );
    expect(first.ok).toBe(true);
    if (first.ok) expect(first.value).toMatchObject({ created: 3, updated: 0, cancelled: 0 });

    const rows = await serviceDb().execute<{ id: string; planner_key: string }>(sql`
      select id::text as id, planner_key from public.schedule_slots
      where user_id = ${userId}::uuid order by planner_key
    `);
    const ids = new Map(rows.map((row) => [row.planner_key, row.id]));
    await serviceDb().execute(sql`
      update public.schedule_slots set status = 'done' where id = ${ids.get('slot-a')}::uuid
    `);
    await serviceDb().execute(sql`
      insert into public.schedule_slots (
        user_id, formation_id, module_id, kind, title, starts_at, ends_at, status, created_by
      ) values (
        ${userId}::uuid, ${programme.formationId}::uuid, ${programme.moduleId}::uuid,
        'revision', 'Créneau manuel', ${new Date(base.getTime() + 6 * HOUR).toISOString()}::timestamptz,
        ${new Date(base.getTime() + 7 * HOUR).toISOString()}::timestamptz, 'planned', 'learner'
      )
    `);

    const second = await persistPlan(
      ctx,
      programme.formationId,
      [
        slot('slot-a', 0, 'Cours A'),
        slot('slot-b', 3, 'Cours B déplacé'),
        slot('slot-d', 8, 'Cours D'),
      ],
      'rev-2',
    );
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.created).toBe(1);
      expect(second.value.updated).toBe(1);
      expect(second.value.cancelled).toBe(1);
      expect(second.value.preserved).toBe(1);
    }

    const after = await serviceDb().execute<{
      planner_key: string | null;
      title: string;
      status: string;
      created_by: string;
    }>(sql`
      select planner_key, title, status::text as status, created_by::text as created_by
      from public.schedule_slots where user_id = ${userId}::uuid order by planner_key nulls first
    `);
    expect(after.find((row) => row.title === 'Cours A')?.status).toBe('done');
    expect(after.find((row) => row.title === 'Cours C')?.status).toBe('cancelled');
    const manual = after.find((row) => row.title === 'Créneau manuel');
    expect(manual?.status).toBe('planned');
    expect(manual?.created_by).toBe('learner');
    expect(after.find((row) => row.title === 'Cours B déplacé')?.status).toBe('planned');

    const replay = await persistPlan(
      ctx,
      programme.formationId,
      [
        slot('slot-a', 0, 'Cours A'),
        slot('slot-b', 3, 'Cours B déplacé'),
        slot('slot-d', 8, 'Cours D'),
      ],
      'rev-2',
    );
    expect(replay.ok).toBe(true);
    if (replay.ok) {
      expect(replay.value.created).toBe(0);
      expect(replay.value.updated).toBe(0);
      expect(replay.value.cancelled).toBe(0);
      expect(replay.value.preserved).toBe(1);
    }
  });
});
