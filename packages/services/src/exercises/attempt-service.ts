// Attempt lifecycle of a practice exercise (SPEC-613 ET-2, ET-4, ET-5, CL-2, CL-3; BR-PRA-01).
//
// Draft, hint and submit all go through one locked attempt: a second identical request observes the
// committed transition and changes nothing. The submit transaction writes the answer, the attempt
// and the `exercise/submitted` outbox row together; the mastery application of SPEC-411 runs after
// the commit and remains idempotent through the unique review-log key.
import { z } from 'zod';

import {
  ExerciseAttemptState,
  ExerciseDraftResult,
  ExerciseHintResult,
  ExerciseSubmissionResult,
  ExerciseSubmissionSchema,
  type ExerciseCorrection,
  type ExerciseInstruction,
  type ExerciseNextStep,
  type ExerciseSubmission,
  type PracticeExerciseDto,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql } from '@learny/db';
import { withTransaction } from '@learny/jobs';

import type { ServiceContext } from '../context';
import { applyLearningResult } from '../learning/apply-result';
import { requireUser, toResult } from '../resources/result';

import {
  attemptDto,
  ensureAttempt,
  instructionOf,
  readBrickVersionId,
  readExercise,
  readLatestAttempt,
  readNotionState,
  upsertAnswer,
  type ExerciseRow,
} from './exercise-store';
import { gradeExercise } from './grade-exercise';
import { masteryAfterOf } from './mastery';
import { validateProduction, type ProductionIssue } from './validate-production';

function exerciseId(value: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new AppError('VALIDATION_FAILED', 'Identifiant d’exercice invalide.');
  return parsed.data;
}

function submissionError(issues: readonly ProductionIssue[]): AppError {
  return new AppError('RESPONSE_INVALID', 'La production envoyée est invalide.', {
    status: 422,
    errors: issues.map((issue) => ({ path: issue.path, message: issue.message })),
  });
}

function nextStepFor(
  row: ExerciseRow,
  instruction: ExerciseInstruction,
  passed: boolean,
): ExerciseNextStep {
  if (passed) {
    return {
      label: `Prochaine étape : consolider « ${row.notion_label} » dans le programme.`,
      href: `/formations/${row.formation_id}/programme`,
    };
  }
  return {
    label: `Reprenez la règle de « ${row.notion_label} », puis retentez l’exercice. Vos lacunes sont à jour.`,
    href: `/formations/${row.formation_id}/lacunes`,
  };
}

function assertSubmissionKind(
  instruction: ExerciseInstruction,
  submission: ExerciseSubmission,
): void {
  if (submission.kind !== instruction.production.kind) {
    throw new AppError(
      'VALIDATION_FAILED',
      'La production ne correspond pas au type attendu par l’exercice.',
    );
  }
}

async function assertFileOwned(
  tx: Parameters<typeof readExercise>[0],
  userId: string,
  submission: ExerciseSubmission,
  instruction: ExerciseInstruction,
): Promise<void> {
  if (submission.kind !== 'file' || instruction.production.kind !== 'file') return;
  const rows = await tx.execute<{ id: string; mime: string | null; size_bytes: number | null }>(sql`
    select id::text as id, mime, size_bytes
    from public.resources
    where id = ${submission.resourceId}::uuid
      and owner_id = ${userId}::uuid
      and deleted_at is null
  `);
  const file = rows[0];
  if (file === undefined) {
    throw submissionError([{ path: 'resourceId', message: 'Fichier introuvable.' }]);
  }
  if (
    file.mime !== null &&
    !(instruction.production.accept as readonly string[]).includes(file.mime)
  ) {
    throw submissionError([
      { path: 'resourceId', message: 'Ce type de fichier n’est pas accepté.' },
    ]);
  }
  if (file.size_bytes !== null && instruction.production.maxSizeMb * 1_000_000 < file.size_bytes) {
    throw submissionError([
      { path: 'resourceId', message: 'Ce fichier dépasse la taille autorisée.' },
    ]);
  }
}

/** Starts or resumes the single in-progress attempt of one owned exercise. */
export async function startExerciseAttempt(
  ctx: ServiceContext,
  input: { exerciseId: string; moduleId?: string },
): Promise<Result<ReturnType<typeof ExerciseAttemptState.parse>>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const id = exerciseId(input.exerciseId);
    return db.run(async (tx) => {
      const row = await readExercise(tx, userId, id);
      if (input.moduleId !== undefined && row.module_id !== input.moduleId) {
        throw new AppError('NOT_FOUND', 'Exercice introuvable.');
      }
      const attempt = await ensureAttempt(tx, userId, id);
      return ExerciseAttemptState.parse({
        attemptId: attempt.attemptId,
        status: 'in_progress',
        hintsUsed: attempt.hintsUsed,
        maxScore: Math.max(0, 10 - attempt.hintsUsed),
      });
    });
  });
}

/** Saves the current production without correction (e2e « reprend une production »). */
export async function saveExerciseDraft(
  ctx: ServiceContext,
  exerciseIdValue: string,
  input: unknown,
): Promise<Result<ReturnType<typeof ExerciseDraftResult.parse>>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const id = exerciseId(exerciseIdValue);
    const parsed = ExerciseSubmissionSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', 'La production envoyée est invalide.', {
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.length > 0 ? issue.path.join('.') : 'submission',
          message: issue.message,
        })),
      });
    }
    const now = ctx.clock.now();
    return db.run(async (tx) => {
      const row = await readExercise(tx, userId, id);
      const instruction = instructionOf(row);
      assertSubmissionKind(instruction, parsed.data);
      const attempt = await ensureAttempt(tx, userId, id);
      const versionId = await readBrickVersionId(tx, id);
      await upsertAnswer(tx, {
        attemptId: attempt.attemptId,
        brickVersionId: versionId,
        response: parsed.data,
        answeredAt: now,
      });
      return ExerciseDraftResult.parse({
        attemptId: attempt.attemptId,
        savedAt: now.toISOString(),
      });
    });
  });
}

/** Reveals the next hint; the third request is refused with 422 and changes no maximum (CL-3). */
export async function requestExerciseHint(
  ctx: ServiceContext,
  input: { exerciseId: string; moduleId?: string },
): Promise<Result<ReturnType<typeof ExerciseHintResult.parse>>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const id = exerciseId(input.exerciseId);
    return db.run(async (tx) => {
      const row = await readExercise(tx, userId, id);
      if (input.moduleId !== undefined && row.module_id !== input.moduleId) {
        throw new AppError('NOT_FOUND', 'Exercice introuvable.');
      }
      const instruction = instructionOf(row);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`exercise-attempt:${userId}:${id}`}, 0))`,
      );
      const last = await readLatestAttempt(tx, userId, id);
      if (last !== null && last.attempt.status === 'graded') {
        throw new AppError('CONFLICT', 'Cet exercice est déjà corrigé.');
      }
      const attempt =
        last !== null && last.attempt.status === 'in_progress'
          ? { attemptId: last.attempt.id, hintsUsed: last.attempt.hints_used }
          : await ensureAttempt(tx, userId, id);
      const updated = await tx.execute<{ hints_used: number }>(sql`
        update public.attempts
        set hints_used = hints_used + 1
        where id = ${attempt.attemptId}::uuid
          and user_id = ${userId}::uuid
          and status = 'in_progress'
          and hints_used < 2
        returning hints_used
      `);
      const hintsUsed = updated[0]?.hints_used;
      if (hintsUsed === undefined) {
        throw new AppError(
          'RESPONSE_INVALID',
          'Deux indices ont déjà été utilisés : le score maximal reste inchangé.',
          { status: 422 },
        );
      }
      const hintText = instruction.hints[hintsUsed - 1];
      if (hintText === undefined) {
        throw new AppError('INTERNAL_ERROR', 'Indice introuvable dans la consigne.');
      }
      return ExerciseHintResult.parse({
        attemptId: attempt.attemptId,
        hintIndex: hintsUsed,
        hintText,
        hintsUsed,
        hintsLeft: Math.max(0, 2 - hintsUsed),
        maxScore: Math.max(0, 10 - hintsUsed),
      });
    });
  });
}

interface SubmitOutcome {
  attemptId: string;
  correction: ExerciseCorrection;
  masteryBefore: number;
  submittedAt: string;
  notionId: string;
  moduleId: string;
  formationId: string;
  alreadyGraded: boolean;
}

async function persistSubmission(
  ctx: ServiceContext,
  exerciseIdValue: string,
  submission: ExerciseSubmission,
): Promise<SubmitOutcome> {
  const { userId, db } = requireUser(ctx);
  const id = exerciseId(exerciseIdValue);
  return await withTransaction(db, async (tx, outbox) => {
    const row = await readExercise(tx, userId, id);
    const instruction = instructionOf(row);
    assertSubmissionKind(instruction, submission);
    await assertFileOwned(tx, userId, submission, instruction);

    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`exercise-attempt:${userId}:${id}`}, 0))`,
    );
    const last = await readLatestAttempt(tx, userId, id);
    if (last !== null && last.attempt.status === 'graded') {
      const correction = attemptDto(last, instruction, 0)?.correction ?? null;
      if (correction !== null) {
        return {
          attemptId: last.attempt.id,
          correction,
          masteryBefore: 0,
          submittedAt:
            last.attempt.submitted_at === null
              ? ctx.clock.now().toISOString()
              : new Date(last.attempt.submitted_at).toISOString(),
          notionId: row.notion_id,
          moduleId: row.module_id,
          formationId: row.formation_id,
          alreadyGraded: true,
        };
      }
    }
    const attempt =
      last !== null && last.attempt.status === 'in_progress'
        ? { attemptId: last.attempt.id, hintsUsed: last.attempt.hints_used }
        : await ensureAttempt(tx, userId, id);

    const state = await readNotionState(tx, userId, row.notion_id);
    const masteryBefore = Number(state.mastery);
    const validated = validateProduction(instruction, submission);
    if (!validated.ok) throw submissionError(validated.error);
    const now = ctx.clock.now();
    const graded = gradeExercise(instruction, validated.value, {
      hintsUsed: attempt.hintsUsed,
      nextStep: nextStepFor(row, instruction, false),
    });
    if (!graded.ok) throw submissionError(graded.error.issues);
    const provisional = graded.value;
    const correction: ExerciseCorrection = {
      ...provisional,
      nextStep: nextStepFor(row, instruction, provisional.verdict === 'passed'),
    };
    const versionId = await readBrickVersionId(tx, id);

    await tx.execute(sql`
      update public.attempts
      set status = 'graded',
          submitted_at = ${now.toISOString()}::timestamptz,
          duration_ms = greatest(
            0,
            floor(extract(epoch from (${now.toISOString()}::timestamptz - started_at)) * 1000)::int
          ),
          score = ${correction.score * 10},
          passed = ${correction.verdict === 'passed'},
          per_notion = ${JSON.stringify({
            [row.notion_id]: {
              correct: correction.verdict === 'passed' ? 1 : 0,
              total: 1,
              score: correction.score * 10,
            },
          })}::jsonb,
          hints_used = ${attempt.hintsUsed},
          review_feedback = ${JSON.stringify({
            summary: correction.summary,
            nextStep: correction.nextStep.label,
            correction,
            masteryBefore,
          })}::jsonb
      where id = ${attempt.attemptId}::uuid
        and user_id = ${userId}::uuid
        and status = 'in_progress'
    `);

    await upsertAnswer(tx, {
      attemptId: attempt.attemptId,
      brickVersionId: versionId,
      response: validated.value,
      isCorrect: correction.verdict === 'passed',
      score: correction.score,
      maxScore: correction.maxScore,
      gradedBy: 'tutor',
      feedback: {
        explanation: correction.summary,
        criteria: correction.criteria.map((criterion) => ({
          key: criterion.key,
          ok: criterion.ok,
          comment: criterion.comment,
        })),
        missing: correction.criteria
          .filter((criterion) => !criterion.ok)
          .map((criterion) => criterion.label),
      },
      answeredAt: now,
    });

    outbox.add(
      'exercise/submitted',
      { userId, moduleId: row.module_id, attemptId: attempt.attemptId },
      { id: `exercise-submitted:${attempt.attemptId}` },
    );

    return {
      attemptId: attempt.attemptId,
      correction,
      masteryBefore,
      submittedAt: now.toISOString(),
      notionId: row.notion_id,
      moduleId: row.module_id,
      formationId: row.formation_id,
      alreadyGraded: false,
    };
  });
}

/** Grades one submission, then applies its mastery through SPEC-411 (EF-3, ET-2, ET-4). */
export async function submitExercise(
  ctx: ServiceContext,
  exerciseIdValue: string,
  input: unknown,
): Promise<Result<ReturnType<typeof ExerciseSubmissionResult.parse>>> {
  return toResult(async () => {
    const parsed = ExerciseSubmissionSchema.safeParse(input);
    if (!parsed.success) {
      throw new AppError('VALIDATION_FAILED', 'La production envoyée est invalide.', {
        errors: parsed.error.issues.map((issue) => ({
          path: issue.path.length > 0 ? issue.path.join('.') : 'submission',
          message: issue.message,
        })),
      });
    }
    const outcome = await persistSubmission(ctx, exerciseIdValue, parsed.data);

    const applied = outcome.alreadyGraded
      ? null
      : await applyLearningResult(ctx, outcome.attemptId);
    if (applied !== null && !applied.ok) {
      ctx.logger.warn('exercise mastery application deferred', {
        outcome: 'exercise_mastery_deferred',
        attempt: outcome.attemptId,
        code: applied.error.code,
      });
    }
    const masteryAfter = await masteryAfterOf(
      ctx,
      outcome.notionId,
      outcome.masteryBefore,
      applied,
    );
    if (!outcome.alreadyGraded) {
      try {
        await ctx.db?.run(async (tx) => {
          await tx.execute(sql`
            update public.attempts
            set review_feedback = jsonb_set(
              coalesce(review_feedback, '{}'::jsonb),
              '{masteryAfter}',
              to_jsonb(${masteryAfter}::numeric)
            )
            where id = ${outcome.attemptId}::uuid
          `);
        });
      } catch (error) {
        ctx.logger.warn(
          'exercise feedback enrichment failed',
          {
            outcome: 'exercise_feedback_deferred',
            code: 'INTERNAL_ERROR',
          },
          error,
        );
      }
    }
    return ExerciseSubmissionResult.parse({
      attemptId: outcome.attemptId,
      status: 'graded',
      correction: outcome.correction,
      masteryBefore: outcome.masteryBefore,
      masteryAfter,
      submittedAt: outcome.submittedAt,
    });
  });
}

/** Page helper: the DTO after a submission, used by server actions if needed later. */
export type ExercisePageDto = PracticeExerciseDto;
