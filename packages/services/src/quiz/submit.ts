import { z } from 'zod';

import { SubmitAttemptOutput, type SubmitAttemptOutput as SubmitOutput } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { serviceDb, sql, type DbTx } from '@learny/db';
import { withTransaction } from '@learny/jobs';
import { notify } from '@learny/notifications';

import type { ServiceContext } from '../context';
import { applyLearningResult } from '../learning/apply-result';
import { requireUser, toResult } from '../resources/result';

import {
  defaultOpenAnswerGrader,
  type OpenAnswerGrader,
  type OpenGrade,
} from './grade-open';
import { computeScore, isPassed, type ScoredAnswer } from './score';

// Submission and grading of a validation attempt (SPEC-611 EF-7, ET-7, ET-8, BR-QUI-02, CL-3,
// CL-6). The submission commits the answers and the `quiz/submitted` event together; the grade job
// corrects the open answers, computes the score with the pure engine, applies the learning result
// and emits `quiz/graded`. A tutor failure leaves the attempt `submitted` and notifies the learner.

interface AttemptRow extends Record<string, unknown> {
  id: string;
  activity_id: string;
  attempt_no: number;
  status: string;
  started_at: Date | string;
  submitted_at: Date | string | null;
  module_id: string;
  formation_id: string;
  threshold: number;
  items: unknown;
}

interface AnswerRow extends Record<string, unknown> {
  id: string;
  position: number;
  brick_version_id: string;
  response: unknown;
  is_correct: boolean | null;
  score: string | null;
  max_score: string | null;
  graded_by: string | null;
  feedback: unknown;
}

interface ItemRow {
  notionId?: unknown;
  notionLabel?: unknown;
  type?: unknown;
  payload?: unknown;
  brickVersionId?: unknown;
}

const UUID = z.uuid();
const GRADING_ATTEMPTS = 3;

function asObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function itemsOf(value: unknown): ItemRow[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is ItemRow => typeof entry === 'object' && entry !== null && !Array.isArray(entry),
  );
}

function isChecked(answer: AnswerRow): boolean {
  if (answer.graded_by === 'code' || answer.graded_by === 'tutor') return true;
  return asObject(answer.feedback)?.checked === true;
}

async function readAttempt(tx: DbTx, userId: string, attemptId: string): Promise<AttemptRow> {
  const rows = await tx.execute<AttemptRow>(sql`
    select
      at.id::text as id,
      at.activity_id::text as activity_id,
      at.attempt_no,
      at.status::text as status,
      at.started_at,
      at.submitted_at,
      act.module_id::text as module_id,
      act.formation_id::text as formation_id,
      (act.config ->> 'threshold')::int as threshold,
      act.items
    from public.attempts at
    join public.activities act on act.id = at.activity_id
    where at.id = ${attemptId}::uuid
      and at.user_id = ${userId}::uuid
      and act.kind = 'validation_quiz'
    limit 1
  `);
  const attempt = rows[0];
  if (attempt === undefined) throw new AppError('NOT_FOUND', 'Tentative introuvable.');
  return attempt;
}

async function readAnswers(tx: DbTx, attemptId: string): Promise<AnswerRow[]> {
  return tx.execute<AnswerRow>(sql`
    select
      id::text as id,
      position,
      brick_version_id::text as brick_version_id,
      response,
      is_correct,
      score::text as score,
      max_score::text as max_score,
      graded_by::text as graded_by,
      feedback
    from public.answers
    where attempt_id = ${attemptId}::uuid
    order by position asc
  `);
}

function textOf(response: unknown): string {
  const value = asObject(response);
  return typeof value?.text === 'string' ? value.text.trim() : '';
}

function pointsOf(answer: AnswerRow): number {
  return answer.max_score === null ? 0 : Number(answer.max_score);
}

function scoredOf(answers: readonly AnswerRow[], items: readonly ItemRow[]): ScoredAnswer[] {
  return answers
    .filter((answer) => answer.is_correct !== null)
    .map((answer) => {
      const item = items[answer.position - 1];
      return {
        position: answer.position,
        notionId:
          typeof item?.notionId === 'string' ? item.notionId : answer.brick_version_id,
        score: answer.score === null ? 0 : Number(answer.score),
        maxScore: pointsOf(answer),
        isCorrect: answer.is_correct,
      };
    });
}

async function notifyTutorFailure(
  ctx: ServiceContext,
  userId: string,
  formationId: string,
  attemptId: string,
): Promise<void> {
  await notify(
    {
      requestId: ctx.requestId,
      sdb: serviceDb(),
      clock: ctx.clock,
      logger: ctx.logger,
    },
    {
      userId,
      formationId,
      type: 'ai_task_failed',
      data: {
        taskLabel: 'La correction de votre quiz',
        modelLabel: 'IA fournie',
        subject: 'Correction de votre quiz',
        managedAvailable: true,
      },
      dedupeKey: `ai_task_failed:quiz-grade:${attemptId}`,
    },
  );
}

export interface GradeOpenOptions {
  grader?: OpenAnswerGrader;
  scenario?: string;
}

export interface GradeOpenOutcome {
  graded: number;
  pending: number;
  failed: boolean;
}

function isRetryable(error: AppError): boolean {
  return [
    'AI_UNAVAILABLE',
    'AI_TASK_FAILED',
    'INVALID_OUTPUT',
    'MOCK_FIXTURE_NOT_FOUND',
    'SERVICE_UNAVAILABLE',
  ].includes(error.code);
}

/** ET-8 step 1 — corrects every pending open answer; three attempts per answer (ADR-0017). */
export function gradeOpenAnswers(
  ctx: ServiceContext,
  attemptIdValue: string,
  options: GradeOpenOptions = {},
): Promise<Result<GradeOpenOutcome>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!UUID.safeParse(attemptIdValue).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de tentative invalide.');
    }
    const attemptId = attemptIdValue;
    const attempt = await db.run((tx) => readAttempt(tx, userId, attemptId));
    if (attempt.status !== 'submitted' && attempt.status !== 'graded') {
      throw new AppError('CONFLICT', 'Cette tentative n’est pas soumise.', { status: 409 });
    }
    const items = itemsOf(attempt.items);
    const answers = await db.run((tx) => readAnswers(tx, attemptId));
    const open = answers.filter((answer) => {
      const item = items[answer.position - 1];
      return item?.type === 'open_question' && answer.is_correct === null && answer.graded_by === null;
    });
    if (open.length === 0) return { graded: 0, pending: 0, failed: false };

    const grader = options.grader ?? defaultOpenAnswerGrader;
    let graded = 0;
    let failed = false;
    for (const answer of open) {
      const item = items[answer.position - 1];
      const input = {
        brickVersionId: answer.brick_version_id,
        notionLabel: typeof item?.notionLabel === 'string' ? item.notionLabel : 'Notion',
        type: 'open_question' as const,
        payload: item?.payload ?? null,
        response: textOf(answer.response),
      };
      let grade: OpenGrade | null = null;
      let lastError: AppError | null = null;
      for (let attemptNo = 1; attemptNo <= GRADING_ATTEMPTS; attemptNo += 1) {
        const result = await grader(
          {
            userId,
            formationId: attempt.formation_id,
            requestId: `${ctx.requestId}:${String(attemptNo)}`,
            llmDb: serviceDb(),
            ...(ctx.logger === undefined ? {} : { logger: ctx.logger }),
            ...(options.scenario === undefined ? {} : { scenario: options.scenario }),
          },
          input,
        );
        if (result.ok) {
          grade = result.value;
          break;
        }
        lastError = result.error;
        if (!isRetryable(result.error)) break;
      }
      if (grade === null) {
        failed = true;
        ctx.logger?.warn('quiz.grade-open.failed', {
          outcome: 'ai_task_failed',
          code: lastError?.code ?? 'AI_UNAVAILABLE',
        });
        continue;
      }

      const ratio = Math.min(Math.max(grade.score, 0), 1);
      const maxScore = pointsOf(answer);
      const points = Math.round(ratio * maxScore * 100) / 100;
      const isCorrect = ratio >= 0.6;
      const title = isCorrect ? 'Exact.' : 'Pas tout à fait.';
      const feedback = {
        isCorrect,
        title,
        explanation: grade.explanation,
        offTopic: grade.offTopic,
        criteria: grade.criteria,
        missing: grade.missing,
        correction: {
          kind: 'open_question',
          explanation: grade.explanation,
          criteria: grade.criteria,
          missing: grade.missing,
        },
      };
      await db.run((tx) =>
        tx.execute(sql`
          update public.answers
          set is_correct = ${isCorrect},
              score = ${points},
              max_score = ${maxScore},
              graded_by = 'tutor',
              feedback = ${JSON.stringify(feedback)}::jsonb
          where id = ${answer.id}::uuid
        `),
      );
      graded += 1;
    }

    if (failed) {
      await notifyTutorFailure(ctx, userId, attempt.formation_id, attemptId);
    }
    return { graded, pending: failed ? open.length - graded : 0, failed };
  });
}

export interface FinalizeOutcome {
  status: 'graded' | 'submitted';
  score: number | null;
  passed: boolean | null;
  threshold: number;
  attemptNo: number;
  formationId: string;
  moduleId: string;
  pendingOpenCount: number;
}

/** ET-8 step 2 — score, `per_notion` and `passed`, without any client-supplied value. */
export function finalizeAttempt(
  ctx: ServiceContext,
  attemptIdValue: string,
): Promise<Result<FinalizeOutcome>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!UUID.safeParse(attemptIdValue).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de tentative invalide.');
    }
    const attemptId = attemptIdValue;
    return withTransaction(db, async (tx) => {
      const attempt = await readAttempt(tx, userId, attemptId);
      const answers = await readAnswers(tx, attemptId);
      const items = itemsOf(attempt.items);
      const pendingOpenCount = answers.filter(
        (answer) => answer.is_correct === null && isChecked(answer),
      ).length;
      const base = {
        threshold: attempt.threshold,
        attemptNo: attempt.attempt_no,
        formationId: attempt.formation_id,
        moduleId: attempt.module_id,
      };
      if (pendingOpenCount > 0) {
        return {
          ...base,
          status: 'submitted' as const,
          score: null,
          passed: null,
          pendingOpenCount,
        };
      }
      const { score, perNotion } = computeScore(scoredOf(answers, items));
      const passed = isPassed(score, attempt.threshold);
      const submittedAt =
        attempt.submitted_at === null ? ctx.clock.now() : new Date(attempt.submitted_at);
      const durationMs = Math.max(
        0,
        Math.round(submittedAt.getTime() - new Date(attempt.started_at).getTime()),
      );
      await tx.execute(sql`
        update public.attempts
        set status = 'graded',
            score = ${score},
            passed = ${passed},
            per_notion = ${JSON.stringify(perNotion)}::jsonb,
            submitted_at = coalesce(submitted_at, ${ctx.clock.now().toISOString()}::timestamptz),
            duration_ms = ${durationMs}
        where id = ${attemptId}::uuid
      `);
      return {
        ...base,
        status: 'graded' as const,
        score,
        passed,
        pendingOpenCount: 0,
      };
    });
  });
}

export interface SubmitOptions {
  /** Test seam of the grade job (integration tests run it directly). */
  grader?: OpenAnswerGrader;
}

export function submitAttempt(
  ctx: ServiceContext,
  attemptIdValue: string,
): Promise<Result<SubmitOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!UUID.safeParse(attemptIdValue).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de tentative invalide.');
    }
    const attemptId = attemptIdValue;
    return withTransaction(db, async (tx, outbox) => {
      const attempt = await readAttempt(tx, userId, attemptId);
      const answers = await readAnswers(tx, attemptId);
      const items = itemsOf(attempt.items);
      const openCount = answers.filter(
        (answer) => items[answer.position - 1]?.type === 'open_question',
      ).length;

      if (attempt.status === 'graded') {
        return SubmitAttemptOutput.parse({ status: 'graded', pendingOpenCount: 0 });
      }
      if (attempt.status === 'submitted') {
        // CL-6 — a second submit relaunches the correction with a distinct event id.
        outbox.add(
          'quiz/submitted',
          {
            userId,
            formationId: attempt.formation_id,
            moduleId: attempt.module_id,
            attemptId,
            activityId: attempt.activity_id,
            openCount,
          },
          { id: `quiz-submitted:${attemptId}:retry:${ctx.clock.now().toISOString()}` },
        );
        return SubmitAttemptOutput.parse({
          status: 'submitted',
          pendingOpenCount: answers.filter((answer) => answer.is_correct === null).length,
        });
      }
      if (attempt.status !== 'in_progress') {
        throw new AppError('CONFLICT', 'Cette tentative n’est plus modifiable.', { status: 409 });
      }

      const unchecked = answers.filter((answer) => !isChecked(answer)).map((answer) => answer.position);
      if (unchecked.length > 0) {
        throw new AppError('CONFLICT', 'Toutes les questions doivent être vérifiées.', {
          status: 409,
          errors: unchecked.map((position) => ({
            code: 'QUESTION_UNCHECKED',
            path: `questions.${String(position)}`,
            message: 'Vérifiez cette question avant de terminer.',
          })),
        });
      }

      const now = ctx.clock.now();
      const durationMs = Math.max(0, now.getTime() - new Date(attempt.started_at).getTime());
      await tx.execute(sql`
        update public.attempts
        set status = 'submitted',
            submitted_at = ${now.toISOString()}::timestamptz,
            duration_ms = ${durationMs}
        where id = ${attemptId}::uuid
      `);
      outbox.add(
        'quiz/submitted',
        {
          userId,
          formationId: attempt.formation_id,
          moduleId: attempt.module_id,
          attemptId,
          activityId: attempt.activity_id,
          openCount,
        },
        { id: `quiz-submitted:${attemptId}` },
      );
      return SubmitAttemptOutput.parse({
        status: 'submitted',
        pendingOpenCount: answers.filter((answer) => answer.is_correct === null).length,
      });
    });
  });
}

/** ET-8 step 4 — emits `quiz/graded` once the learning result is applied. */
export async function emitGraded(
  ctx: ServiceContext,
  outcome: FinalizeOutcome,
  attemptId: string,
): Promise<void> {
  if (ctx.db === null) return;
  await withTransaction(ctx.db, async (_tx, outbox) => {
    outbox.add(
      'quiz/graded',
      {
        userId: ctx.userId ?? '',
        formationId: outcome.formationId,
        moduleId: outcome.moduleId,
        attemptId,
        score: outcome.score ?? 0,
        passed: outcome.passed ?? false,
        threshold: outcome.threshold,
        attemptNo: outcome.attemptNo,
      },
      { id: `quiz-graded:${attemptId}` },
    );
  });
}

/** Runs the whole grade job in order: open answers, score, learning, event (ET-8). */
export async function runQuizGrade(
  ctx: ServiceContext,
  attemptId: string,
  options: SubmitOptions = {},
): Promise<Result<FinalizeOutcome>> {
  const open = await gradeOpenAnswers(ctx, attemptId, {
    ...(options.grader === undefined ? {} : { grader: options.grader }),
  });
  if (!open.ok) return open;
  const finalized = await finalizeAttempt(ctx, attemptId);
  if (!finalized.ok) return finalized;
  if (finalized.value.status === 'graded') {
    const applied = await applyLearningResult(ctx, attemptId);
    if (!applied.ok) return applied;
    await emitGraded(ctx, finalized.value, attemptId);
  }
  return finalized;
}
