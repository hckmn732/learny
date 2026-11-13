import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestCourse, createTestUser } from '@learny/db/testing';
import { makeModuleWithBank } from '@learny/testing';

import { createServiceContext, type ServiceContext } from '../../src/context';
import {
  checkAnswer,
  getAttempt,
  getAttemptResult,
  runQuizGrade,
  saveDraft,
  startValidationAttempt,
  submitAttempt,
} from '../../src/quiz';

const PREFIX = 'sdd-611-';
const FIXED = new Date('2026-11-11T12:20:00Z');

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

interface Fixture {
  userId: string;
  email: string;
  formationId: string;
  moduleId: string;
  ctx: ServiceContext;
}

async function fixture(label: string, options: { subscribe?: boolean } = {}): Promise<Fixture> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email });
    const seeded = await makeModuleWithBank(tx, {
      userId: user.id,
      notions: 11,
      variantsPerFormat: 4,
    });
    await createTestCourse(tx, {
      ownerId: user.id,
      moduleId: seeded.moduleId,
      sectionsPerChapter: 1,
    });
    if (options.subscribe !== false) {
      await tx.execute(sql`
        insert into public.subscriptions (user_id, status, current_period_end)
        values (${user.id}::uuid, 'active', '2030-01-01T00:00:00Z')
      `);
    }
    return {
      userId: user.id,
      email,
      formationId: seeded.formationId,
      moduleId: seeded.moduleId,
      ctx: createServiceContext({
        userId: user.id,
        email,
        requestId: randomUUID(),
        clock: new TestClock(),
      }),
    };
  });
}

async function attemptIdOf(fx: Fixture): Promise<string> {
  const started = await startValidationAttempt(fx.ctx, fx.moduleId);
  expect(started.ok).toBe(true);
  if (!started.ok || !('attemptId' in started.value)) throw new Error('tentative non créée');
  return started.value.attemptId;
}

async function markAnswers(attemptId: string, openScores: readonly string[]): Promise<void> {
  const answers = await serviceDb().execute<{
    id: string;
    position: number;
    max_score: string;
    type: string;
  }>(sql`
    select a.id::text as id, a.position, a.max_score::text as max_score, b.type::text as type
    from public.answers a
    join public.brick_versions bv on bv.id = a.brick_version_id
    join public.bricks b on b.id = bv.brick_id
    where a.attempt_id = ${attemptId}::uuid
    order by a.position
  `);
  let autoIndex = 0;
  let openIndex = 0;
  for (const answer of answers) {
    if (answer.type === 'open_question') {
      const text = openScores[openIndex] ?? 'ZERO';
      openIndex += 1;
      await serviceDb().execute(sql`
        update public.answers
        set response = ${JSON.stringify({ text })}::jsonb,
            feedback = '{"checked": true}'::jsonb,
            max_score = ${answer.max_score},
            graded_by = null
        where id = ${answer.id}::uuid
      `);
      continue;
    }
    const correct = autoIndex < 8;
    autoIndex += 1;
    await serviceDb().execute(sql`
      update public.answers
      set is_correct = ${correct},
          score = ${correct ? answer.max_score : '0'},
          max_score = ${answer.max_score},
          graded_by = 'code',
          feedback = ${JSON.stringify({
            title: correct ? 'Exact.' : 'Pas tout à fait.',
            explanation: 'Explication de correction.',
          })}::jsonb
      where id = ${answer.id}::uuid
    `);
  }
}

afterAll(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

describe('[SPEC-611] tentative de quiz de validation', () => {
  it('CA-1 — 12 questions couvrent les 11 notions avec au moins 3 ouvertes et 5 choix', async () => {
    const fx = await fixture('create');
    const attemptId = await attemptIdOf(fx);
    const attempt = await getAttempt(fx.ctx, attemptId);
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) return;
    expect(attempt.value.total).toBe(12);
    expect(new Set(attempt.value.questions.map((question) => question.notionId)).size).toBe(11);
    expect(
      attempt.value.questions.filter((question) => question.type === 'open_question').length,
    ).toBeGreaterThanOrEqual(3);
    expect(
      attempt.value.questions.filter((question) => question.type === 'choice_question').length,
    ).toBeGreaterThanOrEqual(5);
    expect(attempt.value.attemptNo).toBe(1);
  });

  it('CA-2 — deux tentatives successives ne partagent aucune question, 202 si la banque est vide', async () => {
    const fx = await fixture('renew');
    const firstId = await attemptIdOf(fx);
    const first = await getAttempt(fx.ctx, firstId);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    await serviceDb().execute(sql`
      update public.attempts set status = 'abandoned' where id = ${firstId}::uuid
    `);
    const second = await startValidationAttempt(fx.ctx, fx.moduleId);
    expect(second.ok).toBe(true);
    if (!second.ok || !('attemptId' in second.value)) return;
    const renewed = await getAttempt(fx.ctx, second.value.attemptId);
    expect(renewed.ok).toBe(true);
    if (!renewed.ok) return;
    const firstVersions = new Set(first.value.questions.map((question) => question.brickVersionId));
    expect(
      renewed.value.questions.some((question) => firstVersions.has(question.brickVersionId)),
    ).toBe(false);

    await serviceDb().execute(sql`
      update public.bricks set status = 'reported'
      where owner_id = ${fx.userId}::uuid and purpose = 'bank'
    `);
    await serviceDb().execute(sql`
      update public.attempts set status = 'abandoned' where user_id = ${fx.userId}::uuid
    `);
    const exhausted = await startValidationAttempt(fx.ctx, fx.moduleId);
    expect(exhausted.ok).toBe(true);
    if (!exhausted.ok) return;
    expect('preparing' in exhausted.value && exhausted.value.preparing).toBe(true);
    const jobs = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.question_bank_jobs
      where user_id = ${fx.userId}::uuid
    `);
    expect(jobs[0]?.count ?? 0).toBeGreaterThan(0);
  });

  it('CA-3, CA-7 — vérifier est idempotent, verrouille la réponse et refuse le brouillon', async () => {
    const fx = await fixture('check');
    const attemptId = await attemptIdOf(fx);
    const attempt = await getAttempt(fx.ctx, attemptId);
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) return;
    const choice = attempt.value.questions.find((question) => question.type === 'choice_question');
    if (choice === undefined) throw new Error('aucune question à choix');
    const payload = choice.payload as { options: { id: string; text: string }[] };
    const row = await serviceDb().execute<{ payload: unknown }>(sql`
      select payload from public.brick_versions where id = ${choice.brickVersionId}::uuid
    `);
    const stored = row[0]?.payload as { options: { id: string; correct: boolean }[] };
    const wrong = stored.options.find((option) => !option.correct)?.id ?? payload.options[0]?.id;
    const checked = await checkAnswer(fx.ctx, attemptId, choice.position, {
      response: { optionIds: [wrong] },
      timeMs: 4200,
    });
    expect(checked.ok).toBe(true);
    if (!checked.ok) return;
    expect(checked.value.locked).toBe(true);
    expect(checked.value.feedback.isCorrect).toBe(false);
    expect(checked.value.feedback.title).toBe('Pas tout à fait.');
    const again = await checkAnswer(fx.ctx, attemptId, choice.position, {
      response: { optionIds: [wrong] },
      timeMs: 4200,
    });
    expect(again.ok).toBe(true);
    if (again.ok) expect(again.value.feedback).toEqual(checked.value.feedback);
    const draft = await saveDraft(fx.ctx, attemptId, choice.position, {
      response: { optionIds: [wrong] },
      timeMs: 100,
    });
    expect(draft.ok).toBe(false);
    if (!draft.ok) expect(draft.error.code).toBe('CONFLICT');
    const writes = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.answers
      where attempt_id = ${attemptId}::uuid and position = ${choice.position}
    `);
    expect(writes[0]?.count).toBe(1);
  });

  it('CA-5 — quiz-grade note les ouvertes, calcule le score, applique le moteur et émet quiz/graded', async () => {
    const fx = await fixture('grade');
    const attemptId = await attemptIdOf(fx);
    await markAnswers(attemptId, ['COMPLET', 'PARTIEL', 'ZERO']);
    const submitted = await submitAttempt(fx.ctx, attemptId);
    expect(submitted.ok).toBe(true);

    const graded = await runQuizGrade(fx.ctx, attemptId, {
      grader: (_ctx, input) =>
        Promise.resolve({
          ok: true as const,
          value: {
            score: input.response === 'COMPLET' ? 1 : input.response === 'PARTIEL' ? 0.5 : 0,
            explanation: 'Correction de test.',
            criteria: [{ key: 'comprehension', ok: input.response === 'COMPLET' }],
            missing: [],
            offTopic: input.response === 'ZERO',
          },
        }),
    });
    expect(graded.ok).toBe(true);
    if (!graded.ok) return;
    expect(graded.value.status).toBe('graded');
    expect(graded.value.score ?? 0).toBeCloseTo(79.17, 1);

    const attempt = await serviceDb().execute<{ score: string; passed: boolean; per_notion: unknown }>(sql`
      select score::text as score, passed, per_notion
      from public.attempts where id = ${attemptId}::uuid
    `);
    expect(Number(attempt[0]?.score)).toBeCloseTo(79.17, 1);
    expect(Object.keys(attempt[0]?.per_notion ?? {})).toHaveLength(11);

    const reviews = await serviceDb().execute<{ count: number; source: string }>(sql`
      select count(*)::int as count, min(r.source::text) as source
      from public.review_logs r
      join public.answers a on a.id = r.answer_id
      where a.attempt_id = ${attemptId}::uuid
    `);
    expect(reviews[0]?.count ?? 0).toBeGreaterThan(0);
    expect(reviews[0]?.source).toBe('validation');

    const events = await serviceDb().execute<{ name: string }>(sql`
      select name from public.event_outbox
      where name = 'quiz/graded' and data ->> 'attemptId' = ${attemptId}
    `);
    expect(events.map((event) => event.name)).toEqual(['quiz/graded']);

    const result = await getAttemptResult(fx.ctx, attemptId);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.passed).toBe(false);
  });

  it('CA-8 — tuteur indisponible : la tentative reste soumise, notification et relance', async () => {
    const fx = await fixture('unavailable', { subscribe: false });
    const attemptId = await attemptIdOf(fx);
    await markAnswers(attemptId, ['COMPLET', 'PARTIEL', 'ZERO']);
    const submitted = await submitAttempt(fx.ctx, attemptId);
    expect(submitted.ok).toBe(true);
    const graded = await runQuizGrade(fx.ctx, attemptId);
    expect(graded.ok).toBe(true);
    if (!graded.ok) return;
    expect(graded.value.status).toBe('submitted');
    expect(graded.value.pendingOpenCount).toBeGreaterThan(0);

    const status = await serviceDb().execute<{ status: string }>(sql`
      select status::text as status from public.attempts where id = ${attemptId}::uuid
    `);
    expect(status[0]?.status).toBe('submitted');
    const notifications = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.notifications
      where user_id = ${fx.userId}::uuid and type = 'ai_task_failed'
    `);
    expect(notifications[0]?.count ?? 0).toBe(1);

    const relaunched = await submitAttempt(fx.ctx, attemptId);
    expect(relaunched.ok).toBe(true);
    if (relaunched.ok) expect(relaunched.value.status).toBe('submitted');
  });

  it('RLS — un autre apprenant reçoit 404 sur la tentative', async () => {
    const fx = await fixture('rls');
    const attemptId = await attemptIdOf(fx);
    const other = await fixture('rls-other');
    const attempt = await getAttempt(other.ctx, attemptId);
    expect(attempt.ok).toBe(false);
    if (!attempt.ok) expect(attempt.error.code).toBe('NOT_FOUND');
  });
});
