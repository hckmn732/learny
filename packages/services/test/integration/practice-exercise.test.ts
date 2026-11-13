// Integration tests of the practice exercise services (SPEC-613 §12, CA-1 to CA-4).
//
// Postgres is real: RLS, the attempt lock, the immutable brick version, the unique review-log key
// and the outbox are exercised. The tutor is the committed `LLM_MODE=mock` fixture, so no provider
// is called. Every account is committed (the two-learner test needs a second connection) and
// removed at the end.
import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestCourse, createTestProgramme, createTestUser } from '@learny/db/testing';
import { setEventSender } from '@learny/jobs';
import { createNotionState } from '@learny/testing';

import { createServiceContext, type ServiceContext } from '../../src/context';
import {
  ensurePracticeExercise,
  getPracticeExercise,
  requestExerciseHint,
  saveExerciseDraft,
  submitExercise,
} from '../../src/exercises';

const PREFIX = 'sdd-613-';
const NOW = new Date('2026-11-11T12:20:00Z');

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
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

interface Fixture {
  userId: string;
  email: string;
  formationId: string;
  moduleId: string;
  notionId: string;
  exerciseId: string;
  ctx: ServiceContext;
}

async function fixture(label: string): Promise<Fixture> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  const base = await serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 1,
    });
    const notionId = programme.notionIds[0] as string;
    await tx.execute(sql`
      update public.notions set label = 'Équilibre d’une pièce'
      where id = ${notionId}::uuid
    `);
    const moduleId = programme.moduleIds[0] as string;
    await createTestCourse(tx, { ownerId: user.id, moduleId, sectionsPerChapter: 1 });
    await createNotionState(tx, {
      userId: user.id,
      notionId,
      mastery: 55,
      gapNature: 'application',
      evidence: 'définition juste, mais exercice de saisie échoué.',
      inReview: true,
      dueAt: NOW,
    });
    return {
      userId: user.id,
      formationId: programme.formationId,
      moduleId,
      notionId,
    };
  });
  const ctx = createServiceContext({
    userId: base.userId,
    email,
    requestId: randomUUID(),
    clock: new TestClock(),
  });
  const ensured = await ensurePracticeExercise(ctx, base.notionId);
  if (!ensured.ok) throw new Error(ensured.error.code);
  return { ...base, email, ctx, exerciseId: ensured.value.exerciseId };
}

function validSubmission(): unknown {
  return {
    kind: 'table',
    fields: { type: 'SA', date: '12/11/2026' },
    rows: [
      { cle: '40', compte: '606400', montant: '120' },
      { cle: '50', compte: '512000', montant: '120' },
    ],
    explanation: 'Tout montant débité est crédité ailleurs : le débit égale le crédit.',
  };
}

async function countRows(table: string, userId: string): Promise<number> {
  const rows = await serviceDb().execute<{ count: number }>(sql`
    select count(*)::int as count from public.${sql.raw(table)} where user_id = ${userId}::uuid
  `);
  return rows[0]?.count ?? -1;
}

describe('[SPEC-613] exercice pratique', () => {
  it('crée l’exercice une seule fois par notion et version du cours (ET-4)', async () => {
    const fx = await fixture('ensure');
    const again = await ensurePracticeExercise(fx.ctx, fx.notionId);
    expect(again.ok).toBe(true);
    if (!again.ok) throw new Error(again.error.code);
    expect(again.value.exerciseId).toBe(fx.exerciseId);
    expect(again.value.created).toBe(false);

    const activities = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count
      from public.activities
      where owner_id = ${fx.userId}::uuid
        and kind = 'exercise'
        and config->>'notionId' = ${fx.notionId}
    `);
    expect(activities[0]?.count).toBe(1);
  });

  it('révèle deux indices, refuse le troisième et plafonne le score à 8 (CA-2, CL-3)', async () => {
    const fx = await fixture('hints');
    const first = await requestExerciseHint(fx.ctx, { exerciseId: fx.exerciseId });
    const second = await requestExerciseHint(fx.ctx, { exerciseId: fx.exerciseId });
    const third = await requestExerciseHint(fx.ctx, { exerciseId: fx.exerciseId });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(third.ok).toBe(false);
    if (first.ok) {
      expect(first.value.hintsUsed).toBe(1);
      expect(first.value.maxScore).toBe(9);
    }
    if (second.ok) {
      expect(second.value.hintsUsed).toBe(2);
      expect(second.value.maxScore).toBe(8);
    }
    if (!third.ok) {
      expect(third.error.code).toBe('RESPONSE_INVALID');
      expect(third.error.status).toBe(422);
    }

    const rows = await serviceDb().execute<{ hints_used: number }>(sql`
      select hints_used from public.attempts
      where user_id = ${fx.userId}::uuid and activity_id = ${fx.exerciseId}::uuid
    `);
    expect(rows).toEqual([{ hints_used: 2 }]);
  });

  it('soumet une fois, corrige par critère et met à jour la maîtrise (CA-2, CA-3, CA-4)', async () => {
    const fx = await fixture('submit');
    const first = await submitExercise(fx.ctx, fx.exerciseId, validSubmission());
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error(first.error.code);
    expect(first.value.correction.criteria).toHaveLength(5);
    expect(first.value.correction.criteria.every((criterion) => criterion.points > 0)).toBe(true);
    expect(first.value.correction.score).toBe(10);
    expect(first.value.masteryBefore).toBe(55);
    expect(first.value.masteryAfter).toBeGreaterThanOrEqual(55);
    expect(sent.filter((event) => event.name === 'exercise/submitted')).toHaveLength(1);

    const second = await submitExercise(fx.ctx, fx.exerciseId, validSubmission());
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error(second.error.code);
    expect(second.value.attemptId).toBe(first.value.attemptId);
    expect(sent.filter((event) => event.name === 'exercise/submitted')).toHaveLength(1);
    expect(await countRows('attempts', fx.userId)).toBe(1);

    const answers = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count
      from public.answers a
      join public.attempts at on at.id = a.attempt_id
      where at.user_id = ${fx.userId}::uuid
    `);
    expect(answers[0]?.count).toBe(1);

    const reviews = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count
      from public.review_logs
      where user_id = ${fx.userId}::uuid and source = 'exercise'
    `);
    expect(reviews[0]?.count).toBe(1);

    const states = await serviceDb().execute<{ mastery: string }>(sql`
      select mastery::text as mastery from public.notion_states
      where user_id = ${fx.userId}::uuid and notion_id = ${fx.notionId}::uuid
    `);
    expect(Number(states[0]?.mastery)).toBe(first.value.masteryAfter);

    // Reload: production, correction and mastery before/after are still there.
    const reloaded = await getPracticeExercise(fx.ctx, {
      formationId: fx.formationId,
      moduleId: fx.moduleId,
      exerciseId: fx.exerciseId,
    });
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) throw new Error(reloaded.error.code);
    expect(reloaded.value.attempt?.status).toBe('graded');
    expect(reloaded.value.attempt?.correction?.score).toBe(10);
    expect(reloaded.value.attempt?.submission).toEqual(validSubmission());
    expect(reloaded.value.attempt?.masteryBefore).toBe(55);
    expect(reloaded.value.attempt?.masteryAfter).toBe(first.value.masteryAfter);
  });

  it('reprend le brouillon avant soumission (CA-3)', async () => {
    const fx = await fixture('draft');
    const draft = {
      ...(validSubmission() as Record<string, unknown>),
      explanation: 'Brouillon encore en cours de rédaction.',
    };
    const saved = await saveExerciseDraft(fx.ctx, fx.exerciseId, draft);
    expect(saved.ok).toBe(true);
    const reloaded = await getPracticeExercise(fx.ctx, {
      formationId: fx.formationId,
      moduleId: fx.moduleId,
      exerciseId: fx.exerciseId,
    });
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) throw new Error(reloaded.error.code);
    expect(reloaded.value.attempt?.status).toBe('in_progress');
    expect(reloaded.value.attempt?.submission).toMatchObject({
      kind: 'table',
      explanation: 'Brouillon encore en cours de rédaction.',
    });
  });

  it('refuse un tableau déséquilibré sans écriture ni événement (CA-1, CL-1, CL-4)', async () => {
    const fx = await fixture('invalid');
    const before = await serviceDb().execute<{ attempts: number; answers: number; events: number }>(
      sql`
        select
          (select count(*)::int from public.attempts where user_id = ${fx.userId}::uuid) as attempts,
          (select count(*)::int from public.answers a join public.attempts at on at.id = a.attempt_id
             where at.user_id = ${fx.userId}::uuid) as answers,
          (select count(*)::int from public.event_outbox where user_id = ${fx.userId}::uuid) as events
      `,
    );
    const invalid = {
      ...(validSubmission() as Record<string, unknown>),
      rows: [
        { cle: '40', compte: '606400', montant: '100' },
        { cle: '50', compte: '512000', montant: '120' },
      ],
    };
    const result = await submitExercise(fx.ctx, fx.exerciseId, invalid);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('RESPONSE_INVALID');
      expect(result.error.status).toBe(422);
      expect(result.error.errors).toContainEqual(
        expect.objectContaining({ path: 'rows', message: 'Écart : 20 €' }),
      );
    }
    const after = await serviceDb().execute<{ attempts: number; answers: number; events: number }>(
      sql`
        select
          (select count(*)::int from public.attempts where user_id = ${fx.userId}::uuid) as attempts,
          (select count(*)::int from public.answers a join public.attempts at on at.id = a.attempt_id
             where at.user_id = ${fx.userId}::uuid) as answers,
          (select count(*)::int from public.event_outbox where user_id = ${fx.userId}::uuid) as events
      `,
    );
    expect(after).toEqual(before);
    expect(sent).toEqual([]);
  });

  it('renvoie 404 à un second utilisateur (CA-4)', async () => {
    const first = await fixture('owner');
    const otherEmail = `${PREFIX}other-${randomUUID().slice(0, 8)}@test.learny.test`;
    const other = await serviceDb().transaction(async (tx) => {
      const user = await createTestUser(tx, { email: otherEmail });
      return createServiceContext({
        userId: user.id,
        email: otherEmail,
        requestId: randomUUID(),
        clock: new TestClock(),
      });
    });

    const read = await getPracticeExercise(other, {
      formationId: first.formationId,
      moduleId: first.moduleId,
      exerciseId: first.exerciseId,
    });
    expect(read.ok).toBe(false);
    if (!read.ok) expect(read.error.code).toBe('NOT_FOUND');

    const hint = await requestExerciseHint(other, { exerciseId: first.exerciseId });
    expect(hint.ok).toBe(false);
    if (!hint.ok) expect(hint.error.code).toBe('NOT_FOUND');

    const submit = await submitExercise(other, first.exerciseId, validSubmission());
    expect(submit.ok).toBe(false);
    if (!submit.ok) expect(submit.error.code).toBe('NOT_FOUND');
  });
});
