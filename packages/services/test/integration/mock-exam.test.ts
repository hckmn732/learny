import { randomUUID } from 'node:crypto';

import { afterAll, describe, expect, it } from 'vitest';

import type { Clock } from '@learny/core';
import { closeDb, serviceDb, sql } from '@learny/db';
import { createTestProgramme, createTestUser } from '@learny/db/testing';
import { createBrick } from '@learny/testing';

import { createServiceContext, type ServiceContext } from '../../src/context';
import {
  confirmExamFormat,
  ensureMockExamSlots,
  getExamAttempt,
  getExamIntro,
  getExamResult,
  markExamQuestion,
  saveExamAnswer,
  startExamAttempt,
  submitExam,
} from '../../src/index';

const PREFIX = 'sdd-614-';
const FIXED = new Date('2026-11-11T12:20:00Z');

class TestClock implements Clock {
  now(): Date {
    return new Date(FIXED);
  }
}

interface Fixture {
  userId: string;
  formationId: string;
  moduleIds: string[];
  notionIds: string[];
  ctx: ServiceContext;
}

function choicePayload(label: string, correctId: string): unknown {
  return {
    stem: `Quelle affirmation décrit ${label} ?`,
    mode: 'single',
    options: [
      { id: 'a', text: 'La règle exacte', correct: correctId === 'a', notionId: null },
      { id: 'b', text: 'Une confusion', correct: correctId === 'b', notionId: null },
      { id: 'c', text: 'Un autre élément', correct: correctId === 'c', notionId: null },
    ],
    explanation: 'La règle exacte décrit la notion.',
    objective: 'Vérifier la notion',
    sources: [],
  };
}

async function fixture(label: string, options: { guide?: boolean } = {}): Promise<Fixture> {
  const email = `${PREFIX}${label}-${randomUUID().slice(0, 8)}@test.learny.test`;
  return serviceDb().transaction(async (tx) => {
    const user = await createTestUser(tx, { email });
    const programme = await createTestProgramme(tx, user.id, {
      modules: 7,
      chaptersPerModule: 1,
      notionsPerChapter: 2,
      title: 'SAP S/4HANA Finance',
    });
    // The mockup shares the 20 questions as 2/4/6/2/2/2/2 over the seven modules.
    for (const [moduleIndex, extra] of [
      [1, 2],
      [2, 4],
    ] as const) {
      const moduleId = programme.moduleIds[moduleIndex];
      if (moduleId === undefined) continue;
      const chapter = await tx.execute<{ id: string }>(sql`
        select id::text as id from public.chapters where module_id = ${moduleId}::uuid limit 1
      `);
      const chapterId = chapter[0]?.id;
      if (chapterId === undefined) continue;
      for (let index = 0; index < extra; index += 1) {
        await tx.execute(sql`
          insert into public.notions (
            formation_id, module_id, chapter_id, label, short_definition, position
          ) values (
            ${programme.formationId}::uuid, ${moduleId}::uuid, ${chapterId}::uuid,
            ${`Notion ${String(moduleIndex + 1)}.${String(index + 3)}`},
            'Définition courte', ${index + 3}
          )
        `);
      }
    }
    await tx.execute(sql`
      update public.formations
      set title = 'SAP S/4HANA Finance',
          objectives = '{exam}'::public.formation_objective[],
          start_date = '2026-11-02',
          end_date = '2026-12-11',
          default_threshold = 80
      where id = ${programme.formationId}::uuid
    `);
    const modules = await tx.execute<{ id: string; position: number }>(sql`
      select id::text as id, position from public.modules
      where formation_id = ${programme.formationId}::uuid order by position
    `);
    for (const module of modules) {
      await tx.execute(sql`
        update public.modules
        set title = ${`Module ${String(module.position)}`},
            planned_end = ${module.position >= 6 ? '2026-12-04' : '2026-11-30'}::date
        where id = ${module.id}::uuid
      `);
      if (module.position <= 3) {
        const validated = module.position < 3;
        await tx.execute(sql`
          insert into public.module_progress (user_id, module_id, status, validated_at)
          values (
            ${user.id}::uuid, ${module.id}::uuid,
            ${validated ? 'validated' : 'open'}::public.module_status,
            ${validated ? '2026-11-09T18:00:00Z' : null}::timestamptz
          )
          on conflict (user_id, module_id) do update
          set status = excluded.status, validated_at = excluded.validated_at
        `);
      }
    }
    const notions = await tx.execute<{ id: string; label: string }>(sql`
      select id::text as id, label from public.notions
      where formation_id = ${programme.formationId}::uuid
      order by module_id, position
    `);
    for (const notion of notions) {
      await createBrick(tx, {
        ownerId: user.id,
        formationId: programme.formationId,
        type: 'choice_question',
        purpose: 'bank',
        notionIds: [notion.id],
        payload: choicePayload(notion.label, 'a'),
      });
    }
    if (options.guide === true) {
      await tx.execute(sql`
        insert into public.resources (
          owner_id, formation_id, kind, origin, title, url, status, metadata
        ) values (
          ${user.id}::uuid, ${programme.formationId}::uuid, 'exam_guide', 'learner',
          'Guide de certification', 'https://example.test/guide.pdf', 'ready',
          '{"examFormat":{"questions":20,"durationMin":40,"threshold":70}}'::jsonb
        )
      `);
    }
    await tx.execute(sql`
      insert into public.subscriptions (user_id, status, current_period_end)
      values (${user.id}::uuid, 'active', '2030-01-01T00:00:00Z')
    `);
    await tx.execute(sql`
      update public.profiles
      set onboarding_step = 'done', current_formation_id = ${programme.formationId}::uuid
      where id = ${user.id}::uuid
    `);
    return {
      userId: user.id,
      formationId: programme.formationId,
      moduleIds: modules.map((module) => module.id),
      notionIds: notions.map((notion) => notion.id),
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

describe('[SPEC-614] examen blanc', () => {
  it('CA-1 — sans guide : 20 questions, 40 minutes, seuil 70 %, 8 questions diagnostiques', async () => {
    const fx = await fixture('intro');
    const intro = await getExamIntro(fx.ctx, fx.formationId);
    expect(intro.ok).toBe(true);
    if (!intro.ok) return;
    expect(intro.value.format).toMatchObject({
      questionCount: 20,
      durationMin: 40,
      threshold: 70,
      source: 'default',
      confirmed: true,
    });
    expect(intro.value.studiedModules.map((module) => module.position)).toEqual([1, 2, 3]);
    expect(intro.value.diagnosticModules.map((module) => module.position)).toEqual([4, 5, 6, 7]);
    expect(intro.value.diagnosticQuestionCount).toBe(8);

    const started = await startExamAttempt(fx.ctx, fx.formationId);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const attempt = await getExamAttempt(fx.ctx, started.value.attemptId);
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) return;
    expect(attempt.value.total).toBe(20);
    expect(attempt.value.questions.every((question) => question.feedback === undefined)).toBe(true);
    expect(
      JSON.stringify(attempt.value.questions.map((question) => question.payload)),
    ).not.toContain('"correct"');
    const remaining = attempt.value.remainingSeconds;
    expect(remaining).toBeGreaterThan(2_390);
    expect(remaining).toBeLessThanOrEqual(2_400);
  });

  it('CA-1 — un guide non confirmé ne lance aucune épreuve', async () => {
    const fx = await fixture('guide', { guide: true });
    const intro = await getExamIntro(fx.ctx, fx.formationId);
    expect(intro.ok).toBe(true);
    if (!intro.ok) return;
    expect(intro.value.hasGuide).toBe(true);
    expect(intro.value.format).toMatchObject({ source: 'guide', confirmed: false });
    const refused = await startExamAttempt(fx.ctx, fx.formationId);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.error.code).toBe('FORMAT_NOT_CONFIRMED');
    const confirmed = await confirmExamFormat(fx.ctx, fx.formationId);
    expect(confirmed.ok).toBe(true);
    if (!confirmed.ok) return;
    expect(confirmed.value.confirmed).toBe(true);
    const started = await startExamAttempt(fx.ctx, fx.formationId);
    expect(started.ok).toBe(true);
  });

  it('CA-2, CA-4 — reprise, marqueur, double soumission unique et RLS', async () => {
    const fx = await fixture('submit');
    const started = await startExamAttempt(fx.ctx, fx.formationId);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const attemptId = started.value.attemptId;
    const attempt = await getExamAttempt(fx.ctx, attemptId);
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) return;
    const first = attempt.value.questions[0];
    if (first === undefined) throw new Error('question absente');
    const saved = await saveExamAnswer(fx.ctx, attemptId, first.position, {
      response: { optionIds: ['b'] },
      timeMs: 2_000,
    });
    expect(saved.ok).toBe(true);
    const marked = await markExamQuestion(fx.ctx, attemptId, first.position, true);
    expect(marked.ok).toBe(true);
    const resumed = await startExamAttempt(fx.ctx, fx.formationId);
    expect(resumed.ok).toBe(true);
    if (resumed.ok) {
      expect(resumed.value.attemptId).toBe(attemptId);
      expect(resumed.value.resumed).toBe(true);
    }
    const reloaded = await getExamAttempt(fx.ctx, attemptId);
    expect(reloaded.ok).toBe(true);
    if (reloaded.ok) {
      expect(reloaded.value.questions[0]?.response).toEqual({ optionIds: ['b'] });
      expect(reloaded.value.questions[0]?.marked).toBe(true);
      expect(reloaded.value.markedCount).toBe(1);
      expect(reloaded.value.remainingSeconds).toBeLessThanOrEqual(2_400);
    }

    const [firstSubmit, secondSubmit] = await Promise.all([
      submitExam(fx.ctx, attemptId, { trigger: 'manual' }),
      submitExam(fx.ctx, attemptId, { trigger: 'manual' }),
    ]);
    expect(firstSubmit.ok).toBe(true);
    expect(secondSubmit.ok).toBe(true);
    const events = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.event_outbox
      where name = 'exam/submitted' and data ->> 'attemptId' = ${attemptId}
    `);
    expect(events[0]?.count).toBe(1);

    const other = await fixture('rls-other');
    const forbidden = await getExamAttempt(other.ctx, attemptId);
    expect(forbidden.ok).toBe(false);
    if (!forbidden.ok) expect(forbidden.error.code).toBe('NOT_FOUND');
  });

  it('CA-3 — score étudié séparé du diagnostic et lacunes limitées aux modules étudiés', async () => {
    const fx = await fixture('grade');
    const started = await startExamAttempt(fx.ctx, fx.formationId);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const attemptId = started.value.attemptId;
    const attempt = await getExamAttempt(fx.ctx, attemptId);
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) return;
    // Every studied question is answered correctly, every diagnostic question incorrectly.
    for (const question of attempt.value.questions) {
      const correct = question.modulePosition <= 3;
      const saved = await saveExamAnswer(fx.ctx, attemptId, question.position, {
        response: { optionIds: [correct ? 'a' : 'b'] },
        timeMs: 1_000,
      });
      expect(saved.ok).toBe(true);
    }
    const submitted = await submitExam(fx.ctx, attemptId, { trigger: 'manual' });
    expect(submitted.ok).toBe(true);
    if (!submitted.ok) return;
    expect(submitted.value.status).toBe('graded');
    const result = await getExamResult(fx.ctx, attemptId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.studied).toMatchObject({ correct: 12, total: 12, score: 100 });
    expect(result.value.diagnostic).toMatchObject({ correct: 0, total: 8, score: 0 });
    expect(result.value.score).toBe(60);
    expect(result.value.gaps).toEqual([]);
    expect(result.value.review.filter((row) => !row.studied)).toHaveLength(8);
    const diagnosticGaps = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count
      from public.gap_events ge
      join public.notions n on n.id = ge.notion_id
      join public.modules m on m.id = n.module_id
      where ge.user_id = ${fx.userId}::uuid and m.position > 3
    `);
    expect(diagnosticGaps[0]?.count).toBe(0);
  });

  it('CA-2 — une tentative expirée est soumise automatiquement et une seule fois', async () => {
    const fx = await fixture('expired');
    const started = await startExamAttempt(fx.ctx, fx.formationId);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const attemptId = started.value.attemptId;
    await serviceDb().execute(sql`
      update public.attempts
      set started_at = '2026-11-11T11:30:00Z', deadline_at = '2026-11-11T12:10:00Z'
      where id = ${attemptId}::uuid
    `);
    const read = await getExamAttempt(fx.ctx, attemptId);
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.value.status).toBe('graded');
    const again = await getExamAttempt(fx.ctx, attemptId);
    expect(again.ok).toBe(true);
    const events = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.event_outbox
      where name = 'exam/submitted' and data ->> 'attemptId' = ${attemptId}
    `);
    expect(events[0]?.count).toBe(1);
    const result = await getExamResult(fx.ctx, attemptId);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.timedOut).toBe(true);
  });

  it('BR-PRA-05 — deux examens blancs sont planifiés pour un objectif examen', async () => {
    const fx = await fixture('planning');
    const scheduled = await ensureMockExamSlots(fx.ctx, fx.formationId);
    expect(scheduled.ok).toBe(true);
    if (!scheduled.ok) return;
    expect(scheduled.value.map((exam) => exam.date)).toEqual(['2026-12-04', '2026-12-11']);
    expect(scheduled.value.every((exam) => exam.durationMin === 40)).toBe(true);
    const slots = await serviceDb().execute<{ count: number }>(sql`
      select count(*)::int as count from public.schedule_slots
      where user_id = ${fx.userId}::uuid and kind = 'mock_exam' and status = 'planned'
    `);
    expect(slots[0]?.count).toBe(2);
    const intro = await getExamIntro(fx.ctx, fx.formationId);
    expect(intro.ok).toBe(true);
    if (intro.ok) expect(intro.value.nextExams).toHaveLength(2);
  });
});

describe('[SPEC-614] soumission partielle', () => {
  it('soumet une seule réponse et corrige les questions sans réponse', async () => {
    const fx = await fixture('partial');
    const started = await startExamAttempt(fx.ctx, fx.formationId);
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    const attemptId = started.value.attemptId;
    const attempt = await getExamAttempt(fx.ctx, attemptId);
    expect(attempt.ok).toBe(true);
    if (!attempt.ok) return;
    const first = attempt.value.questions[0];
    if (first === undefined) throw new Error('question absente');
    await saveExamAnswer(fx.ctx, attemptId, first.position, {
      response: { optionIds: ['a'] },
      timeMs: 1000,
    });
    await markExamQuestion(fx.ctx, attemptId, first.position, true);
    const submitted = await submitExam(fx.ctx, attemptId, { trigger: 'manual' });
    if (!submitted.ok) console.error('SUBMIT_ERROR', submitted.error);
    expect(submitted.ok).toBe(true);
    const result = await getExamResult(fx.ctx, attemptId);
    if (!result.ok) console.error('RESULT_ERROR', result.error);
    expect(result.ok).toBe(true);
  });
});
