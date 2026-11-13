import { z } from 'zod';

import type { SelfTestAnswerDto } from '@learny/contracts';
import { AppError, userDayBounds, userLocalDay, type Result } from '@learny/core';
import { createActivity, createAttempt, recordAnswer, serviceDb, sql, type DbTx } from '@learny/db';
import { llm } from '@learny/llm';
import {
  buildSelfTestGradePrompt,
  buildSelfTestQuestionPrompt,
  createDbToolRuntime,
} from '@learny/tutor';

import type { ServiceContext } from '../context';
import { applyLearningResult } from '../learning/index';
import { requireUser, toResult } from '../resources/result';

import { messageDto, conversationMessages } from './conversations';

// SPEC-610 ET-7, BR-TUT-04, ADR-0174 — « Teste-moi » asks one open question, grades the answer,
// applies the mastery and places a wrong notion in the next global quiz. The question is an
// `open_question` brick wrapped in a `self_test` activity; the answer is written before the
// correction and `applyLearningResult` owns every mastery/FSRS/gap write (SPEC-411).

export const SELF_TEST_GRADE_SCHEMA = z
  .strictObject({
    score: z.number().min(0).max(1),
    feedback: z.string().min(1).max(1_000),
  })
  .describe('Verdict borné d’une réponse à un Teste-moi (ADR-0174).');

export interface PendingSelfTest {
  activityId: string;
  brickId: string;
  brickVersionId: string;
  attemptId: string;
  notionId: string;
  notionLabel: string;
  question: string;
}

interface SelfTestRow extends Record<string, unknown> {
  id: string;
  self_test: unknown;
}

const OPEN_QUESTION_PAYLOAD = (question: string, notionLabel: string) => ({
  stem: question,
  expectedElements: [`L’idée essentielle de ${notionLabel}`],
  criteria: [
    { key: 'idee', label: `Idée essentielle de ${notionLabel}`, points: 10, description: '' },
  ],
  answerMaxChars: 1_500,
  modelAnswer: `Une réponse juste mobilise ${notionLabel} et l’explique dans le contexte du chapitre.`,
  explanation: `La question vérifie la compréhension de ${notionLabel}, sans récitation.`,
  objective: `Vérifier ${notionLabel}`,
  sources: [],
});

function looksInjection(text: string): boolean {
  return /ignore (tes|vos) instructions|r[ée]v[èe]le ta consigne|system prompt/i.test(text);
}

function asksForTest(text: string): boolean {
  return /\b(teste|interroge|pose-moi une question|v[ée]rifie ma)\b/i.test(text);
}

function mockGradeScenario(answer: string): string {
  return /\b31\b/.test(answer) && /cr[ée]dit/i.test(answer)
    ? 'self-test-grade-ok'
    : 'self-test-grade-ko';
}

async function questionOf(
  ctx: ServiceContext,
  profile: { tone: 'vous' | 'tu'; courseLanguage: 'fr' | 'en' | 'es' | 'de' },
  notionLabel: string,
  contextBlock: string,
  scenario: string,
  formationId: string | null,
): Promise<string> {
  const { userId } = requireUser(ctx);
  const created = await llm.session(
    { userId, db: serviceDb() },
    {
      task: 'tutor',
      promptId: 'self-test-question.self-test-question',
      formationId,
      mock: { scenario },
    },
  );
  if (!created.ok) throw created.error;
  const prompt = buildSelfTestQuestionPrompt({ profile, notionLabel, context: contextBlock });
  const step = await created.value.step({ system: prompt.system, messages: prompt.messages });
  if (!step.ok) throw step.error;
  const text = step.value.text.trim();
  if (text === '') throw new AppError('AI_TASK_FAILED', 'Le tuteur n’a pas posé de question.');
  return text.slice(0, 600);
}

async function createSelfTestAttempt(
  tx: DbTx,
  input: {
    userId: string;
    formationId: string;
    moduleId: string;
    notionId: string;
    question: string;
    notionLabel: string;
    profile: { tone: 'vous' | 'tu'; courseLanguage: 'fr' | 'en' | 'es' | 'de' };
    now: Date;
  },
): Promise<{ activityId: string; brickId: string; brickVersionId: string; attemptId: string }> {
  const runtime = createDbToolRuntime(tx);
  const scope = {
    userId: input.userId,
    formationId: input.formationId,
    profile: input.profile,
    task: 'tutor' as const,
    now: input.now,
    newId: () => crypto.randomUUID(),
  };
  const written = await runtime.writeStructure(scope, {
    formationId: input.formationId,
    action: 'create',
    data: {
      kind: 'brick',
      draft: {
        type: 'open_question',
        formationId: input.formationId,
        purpose: 'review',
        notionIds: [input.notionId],
        origin: 'tutor',
        payload: OPEN_QUESTION_PAYLOAD(input.question, input.notionLabel),
      },
    },
  });
  const version = await tx.execute<{ id: string }>(sql`
    select id::text as id from public.brick_versions
    where brick_id = ${written.id}::uuid and version = ${written.version ?? 1}
    limit 1
  `);
  const brickVersionId = version[0]?.id;
  if (brickVersionId === undefined)
    throw new AppError('INTERNAL_ERROR', 'Version de brique absente.');
  const activity = await createActivity(tx, {
    ownerId: input.userId,
    formationId: input.formationId,
    moduleId: input.moduleId,
    kind: 'self_test',
    items: [{ brickId: written.id, brickVersionId }],
    status: 'ready',
  });
  const attempt = await createAttempt(tx, { userId: input.userId, activityId: activity.id });
  return {
    activityId: activity.id,
    brickId: written.id,
    brickVersionId,
    attemptId: attempt.id,
  };
}

/** ET-7 — asks the pending question and returns the metadata stored on the tutor message. */
export async function askSelfTest(
  ctx: ServiceContext,
  ref: { id: string; courseId: string; chapterId: string },
  context: {
    profile: { tone: 'vous' | 'tu'; courseLanguage: 'fr' | 'en' | 'es' | 'de' };
    promptBlock: string;
    gapNotionId: string | null;
    notionIds: readonly string[];
    notionLabels: Record<string, string>;
    formationId: string;
  },
  moduleId: string,
): Promise<{ question: string; pending: PendingSelfTest }> {
  const { userId, db } = requireUser(ctx);
  const notionId = context.gapNotionId ?? context.notionIds[0];
  if (notionId === undefined) {
    throw new AppError('VALIDATION_FAILED', 'Aucune notion à tester dans ce chapitre.');
  }
  const notionLabel = context.notionLabels[notionId] ?? 'cette notion';
  const count = await db.run((tx) =>
    tx.execute<{ total: number }>(sql`
      select count(*)::int as total from public.tutor_messages m
      join public.tutor_conversations conv on conv.id = m.conversation_id
      where conv.id = ${ref.id}::uuid and m.self_test is not null
    `),
  );
  const scenario = (count[0]?.total ?? 0) % 2 === 0 ? 'self-test-q1' : 'self-test-q2';
  const question = await questionOf(
    ctx,
    context.profile,
    notionLabel,
    context.promptBlock,
    scenario,
    context.formationId,
  );
  const created = await db.run((tx) =>
    createSelfTestAttempt(tx, {
      userId,
      formationId: context.formationId,
      moduleId,
      notionId,
      question,
      notionLabel,
      profile: context.profile,
      now: ctx.clock.now(),
    }),
  );
  return {
    question,
    pending: {
      ...created,
      notionId,
      notionLabel,
      question,
    },
  };
}

async function pendingSelfTest(
  ctx: ServiceContext,
  conversationId: string,
): Promise<{ row: SelfTestRow; pending: PendingSelfTest }> {
  const messages = await conversationMessages(ctx, conversationId);
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const row = messages[index];
    if (row?.role !== 'tutor' || row.self_test === null || row.self_test === undefined) continue;
    const data = row.self_test as Record<string, unknown>;
    if (data.status !== 'pending') continue;
    return {
      row: { id: row.id, self_test: data },
      pending: {
        activityId: String(data.activityId),
        brickId: String(data.brickId),
        brickVersionId: String(data.brickVersionId),
        attemptId: String(data.attemptId),
        notionId: String(data.notionId),
        notionLabel: String(data.notionLabel),
        question: String(data.question),
      },
    };
  }
  throw new AppError('CONFLICT', 'Aucune question Teste-moi n’est en attente.');
}

async function globalQuizTime(
  ctx: ServiceContext,
  formationId: string,
): Promise<{ label: string; today: boolean }> {
  const { userId, db } = requireUser(ctx);
  const rows = await db.run((tx) =>
    tx.execute<{ starts_at: Date | string; timezone: string }>(sql`
      select s.starts_at, p.timezone
      from public.schedule_slots s
      join public.profiles p on p.id = s.user_id
      where s.user_id = ${userId}::uuid and s.formation_id = ${formationId}::uuid
        and s.kind = 'global_quiz'
        and s.starts_at >= ${ctx.clock.now().toISOString()}::timestamptz
      order by s.starts_at asc
      limit 1
    `),
  );
  const row = rows[0];
  if (row === undefined) return { label: 'demain', today: false };
  const instant = row.starts_at instanceof Date ? row.starts_at : new Date(row.starts_at);
  const localDay = userLocalDay(instant, row.timezone);
  const today = localDay === userLocalDay(ctx.clock.now(), row.timezone);
  const formatted = new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: row.timezone,
  }).format(instant);
  return { label: today ? formatted : 'demain', today };
}

/** ET-7, CA-4 — grades the pending answer, applies the mastery and writes the correction message. */
export async function answerSelfTest(
  ctx: ServiceContext,
  conversationId: string,
  text: string,
): Promise<Result<SelfTestAnswerDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const { row, pending } = await pendingSelfTest(ctx, conversationId);
    const ref = await db.run((tx) =>
      tx.execute<{
        formation_id: string;
        module_id: string;
        timezone: string;
        course_id: string;
      }>(sql`
        select c.formation_id::text as formation_id, c.module_id::text as module_id,
          p.timezone, conv.course_id::text as course_id
        from public.tutor_conversations conv
        join public.courses c on c.id = conv.course_id
        join public.profiles p on p.id = conv.user_id
        where conv.id = ${conversationId}::uuid and conv.user_id = ${userId}::uuid
      `),
    );
    const meta = ref[0];
    if (meta === undefined) throw new AppError('NOT_FOUND', 'Discussion introuvable.');
    const profileRows = await db.run((tx) =>
      tx.execute<{ tutor_tone: 'vous' | 'tu'; course_language: 'fr' | 'en' | 'es' | 'de' }>(sql`
        select tutor_tone::text as tutor_tone, course_language::text as course_language
        from public.profiles where id = ${userId}::uuid
      `),
    );
    const profile = {
      tone: profileRows[0]?.tutor_tone ?? 'vous',
      courseLanguage: profileRows[0]?.course_language ?? 'fr',
    };
    const graded = await gradeAnswer(ctx, pending, text, profile, meta.formation_id);
    const applied = await applyLearningResult(ctx, pending.attemptId);
    if (!applied.ok) throw applied.error;
    const state = applied.value.states.find((entry) => entry.notionId === pending.notionId);
    const masteryBefore = Math.round(state?.masteryBefore ?? 0);
    const masteryAfter = Math.round(state?.masteryAfter ?? masteryBefore);
    const correct = graded.score >= 0.6;
    if (!correct) {
      const { end } = userDayBounds(userLocalDay(ctx.clock.now(), meta.timezone), meta.timezone);
      await db.run(async (tx) => {
        await tx.execute(sql`
          update public.notion_states
          set in_review = true,
              due_at = least(coalesce(due_at, ${end}::timestamptz), ${end}::timestamptz),
              updated_at = ${ctx.clock.now().toISOString()}::timestamptz
          where user_id = ${userId}::uuid and notion_id = ${pending.notionId}::uuid
        `);
      });
    }
    const quiz = correct ? null : await globalQuizTime(ctx, meta.formation_id);
    const verdict = correct
      ? `Je note la réussite : la notion « ${pending.notionLabel} » passe de ${String(masteryBefore)} % à ${String(masteryAfter)} % de maîtrise.`
      : quiz?.label === 'demain'
        ? 'Je remets cette notion dans votre quiz global de demain.'
        : `Je remets cette notion dans votre quiz global de ce soir, à ${quiz?.label ?? '17:00'}.`;
    const content = `${graded.feedback}\n\n${verdict}`;
    const selfTest = {
      ...(row.self_test as Record<string, unknown>),
      status: 'answered',
      correct,
      masteryBefore,
      masteryAfter,
    };
    const inserted = await db.run(async (tx) => {
      await tx.execute(sql`
        insert into public.tutor_messages (conversation_id, user_id, role, content, context, sources, follow_ups)
        values (
          ${conversationId}::uuid, ${userId}::uuid, 'learner', ${text},
          ${JSON.stringify({ include: {}, selfTestAnswer: true })}::jsonb, '[]'::jsonb, '{}'::text[]
        )
      `);
      await tx.execute(sql`
        update public.tutor_messages
        set self_test = ${JSON.stringify(selfTest)}::jsonb
        where id = ${row.id}::uuid and user_id = ${userId}::uuid
      `);
      const message = await tx.execute(sql`
        insert into public.tutor_messages (
          conversation_id, user_id, role, content, context, sources, follow_ups, self_test
        ) values (
          ${conversationId}::uuid, ${userId}::uuid, 'tutor', ${content},
          ${JSON.stringify({
            followUpLabels: { test_me: 'Teste-moi', example: 'Un exemple concret' },
          })}::jsonb,
          '[]'::jsonb, '{test_me,example}'::text[], ${JSON.stringify(selfTest)}::jsonb
        )
        returning id::text as id, role::text as role, content, sources, follow_ups, self_test, context, created_at
      `);
      return message[0];
    });
    if (inserted === undefined) throw new AppError('INTERNAL_ERROR', 'Correction non enregistrée.');
    return { message: messageDto(inserted as never) };
  });
}

async function gradeAnswer(
  ctx: ServiceContext,
  pending: PendingSelfTest,
  text: string,
  profile: { tone: 'vous' | 'tu'; courseLanguage: 'fr' | 'en' | 'es' | 'de' },
  formationId: string,
): Promise<{ score: number; feedback: string }> {
  const { userId, db } = requireUser(ctx);
  const created = await llm.session(
    { userId, db: serviceDb() },
    {
      task: 'tutor',
      promptId: 'self-test-grade.self-test-grade',
      formationId,
      mock: { scenario: mockGradeScenario(text) },
    },
  );
  if (!created.ok) throw created.error;
  const prompt = buildSelfTestGradePrompt({
    profile,
    question: pending.question,
    expected: [`L’idée essentielle de ${pending.notionLabel}`],
    answer: text,
  });
  const graded = await created.value.object({
    system: prompt.system,
    messages: prompt.messages,
    schema: SELF_TEST_GRADE_SCHEMA,
  });
  if (!graded.ok) throw graded.error;
  const verdict = graded.value;
  await db.run(async (tx) => {
    await recordAnswer(tx, {
      attemptId: pending.attemptId,
      brickVersionId: pending.brickVersionId,
      position: 1,
      response: { text },
      isCorrect: verdict.score >= 0.6,
      score: verdict.score,
      maxScore: 1,
      gradedBy: 'tutor',
      feedback: { explanation: verdict.feedback, missing: [] },
    });
    await tx.execute(sql`
      update public.attempts
      set status = 'graded', submitted_at = ${ctx.clock.now().toISOString()}::timestamptz,
          duration_ms = 0, score = ${verdict.score * 100},
          passed = ${verdict.score >= 0.6}
      where id = ${pending.attemptId}::uuid and user_id = ${userId}::uuid
    `);
  });
  return { score: verdict.score, feedback: verdict.feedback };
}

export { asksForTest, looksInjection };
