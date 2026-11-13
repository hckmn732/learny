import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import { type Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestCourse, createTestProgramme, createTestUser } from '@learny/db/testing';
import { processQuestionBankJobs } from '@learny/tutor';

import { createServiceContext } from '../../src/context';
import { prepareQuestionBank, requestQuestionBank } from '../../src/questions';

const PREFIX = 'sdd-513-';
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
  courseId: string;
  notionId: string;
  ctx: ReturnType<typeof createServiceContext>;
}

async function createLearner(label: string): Promise<Fixture> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 1,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
    });
    const moduleId = programme.moduleIds[0];
    if (moduleId === undefined) throw new Error('module de test absent');
    const course = await createTestCourse(tx, { ownerId: user.id, moduleId });
    await tx.execute(sql`
      insert into public.subscriptions (user_id, status, current_period_end)
      values (${user.id}::uuid, 'active', '2030-01-01T00:00:00Z')
    `);
    const notionId = programme.notionIds[0];
    if (notionId === undefined) throw new Error('notion de test absente');
    return {
      userId: user.id,
      email,
      formationId: programme.formationId,
      courseId: course.courseId,
      notionId,
      ctx: createServiceContext({
        userId: user.id,
        email,
        requestId: randomUUID(),
        clock: new TestClock(),
      }),
    };
  });
}

afterAll(async () => {
  await serviceDb().execute(
    sql`delete from auth.users where email like ${`${PREFIX}%@test.learny.test`}`,
  );
  await closeDb();
});

describe('[SPEC-513] service', () => {
  it('CA-1 — prépare quatre variantes distinctes et les persiste sous RLS', async () => {
    const fx = await createLearner('prepare');
    const result = await prepareQuestionBank(fx.ctx, {
      courseVersionId: fx.courseId,
      notionId: fx.notionId,
      formats: ['choice_question'],
      count: 4,
      reason: 'manual',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw result.error;
    expect(result.value.complete).toBe(true);
    expect(result.value.variants).toHaveLength(4);
    expect(new Set(result.value.variants.map((variant) => variant.fingerprint)).size).toBe(4);
    expect(result.value.groups[0]).toMatchObject({ available: 4, required: 4, complete: true });

    const rows = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count
      from public.bricks b
      join public.brick_versions v on v.brick_id = b.id
      where b.owner_id = ${fx.userId}::uuid
        and b.purpose = 'bank'
        and v.fingerprint is not null
    `);
    expect(rows[0]?.count).toBe(4);
  });

  it('CA-2 — un second membre ne lit ni ne prépare la banque du premier', async () => {
    const owner = await createLearner('owner');
    const member = await createLearner('member');
    const prepared = await prepareQuestionBank(owner.ctx, {
      courseVersionId: owner.courseId,
      notionId: owner.notionId,
      formats: ['choice_question'],
      count: 4,
      reason: 'manual',
    });
    expect(prepared.ok).toBe(true);

    const foreign = await prepareQuestionBank(member.ctx, {
      courseVersionId: owner.courseId,
      notionId: owner.notionId,
      formats: ['choice_question'],
      count: 4,
      reason: 'manual',
    });
    expect(foreign.ok).toBe(false);
    if (!foreign.ok) expect(foreign.error.code).toBe('COURSE_NOT_READY');

    const visible = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.bricks
      where owner_id = ${member.userId}::uuid and purpose = 'bank'
    `);
    expect(visible[0]?.count).toBe(0);
  });

  it('CA-3 — l’épuisement demande une régénération sans resservir une empreinte', async () => {
    const fx = await createLearner('exhaustion');
    const first = await prepareQuestionBank(fx.ctx, {
      courseVersionId: fx.courseId,
      notionId: fx.notionId,
      formats: ['choice_question'],
      count: 4,
      reason: 'manual',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) throw first.error;
    const firstPrints = new Set(first.value.variants.map((variant) => variant.fingerprint));

    const again = await prepareQuestionBank(fx.ctx, {
      courseVersionId: fx.courseId,
      notionId: fx.notionId,
      formats: ['choice_question'],
      count: 4,
      reason: 'exhaustion',
    });
    expect(again.ok).toBe(true);
    if (!again.ok) throw again.error;
    expect(again.value.variants).toHaveLength(8);
    const fresh = again.value.variants.filter((variant) => !firstPrints.has(variant.fingerprint));
    expect(fresh).toHaveLength(4);
    expect(again.value.groups[0]?.inserted).toBe(4);
  });

  it('CA-4 — deux jobs concurrents n’insèrent aucun doublon', async () => {
    const fx = await createLearner('concurrent');
    const input = {
      courseVersionId: fx.courseId,
      notionId: fx.notionId,
      formats: ['choice_question'] as const,
      count: 4,
      reason: 'manual' as const,
    };
    const [left, right] = await Promise.all([
      prepareQuestionBank(fx.ctx, input),
      prepareQuestionBank(fx.ctx, input),
    ]);
    expect(left.ok).toBe(true);
    expect(right.ok).toBe(true);
    const rows = await serviceDb().execute<{ count: number; distinct: number }>(sql`
      select count(*)::int as count, count(distinct v.fingerprint)::int as distinct
      from public.bricks b
      join public.brick_versions v on v.brick_id = b.id
      where b.owner_id = ${fx.userId}::uuid and b.purpose = 'bank'
    `);
    expect(rows[0]?.count).toBe(4);
    expect(rows[0]?.distinct).toBe(4);
  });

  it('ET-2, CL-5 — le job en file est traité par le lot et reste idempotent', async () => {
    const fx = await createLearner('job');
    const requested = await requestQuestionBank(fx.ctx, {
      courseVersionId: fx.courseId,
      notionIds: [fx.notionId],
      formats: ['choice_question'],
      count: 4,
      reason: 'nightly',
    });
    expect(requested.ok).toBe(true);
    if (!requested.ok) throw requested.error;
    expect(requested.value.jobs[0]?.status).toBe('queued');

    const processed = await processQuestionBankJobs(
      {
        userId: fx.userId,
        requestId: randomUUID(),
        store: { run: (fn) => serviceDb().transaction(fn) },
        llmDb: serviceDb(),
        clock: new TestClock(),
      },
      { limit: 10 },
    );
    expect(processed.failed).toBe(0);
    const row = await serviceDb().execute<{ status: string; complete: boolean }>(sql`
      select status::text as status, complete from public.question_bank_jobs
      where user_id = ${fx.userId}::uuid and notion_id = ${fx.notionId}::uuid
    `);
    expect(row[0]).toMatchObject({ status: 'done', complete: true });
  });
});
