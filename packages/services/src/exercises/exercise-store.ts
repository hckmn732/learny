// Internal read model of a practice exercise (SPEC-613 ET-1, ET-2, ET-5).
//
// Every query runs through the learner's RLS transaction: an exercise of another owner is absent
// from the result and therefore a 404, never an empty page revealing its existence. The immutable
// brick version holds the instruction; the latest attempt and its answer hold the production and
// the correction, so a reload restores both without recomputing a grade.
import { sql } from 'drizzle-orm';

import { ENGINE } from '@learny/config/product';
import {
  ExerciseAttemptSchema,
  ExerciseCorrectionSchema,
  ExerciseInstructionSchema,
  ExerciseSubmissionSchema,
  PracticeExerciseDto,
  type ExerciseAttempt,
  type ExerciseInstruction,
} from '@learny/contracts';
import { AppError } from '@learny/core';
import { createAttempt, type DbTx } from '@learny/db';

export interface ExerciseRow {
  [key: string]: unknown;
  exercise_id: string;
  formation_id: string;
  formation_title: string;
  module_id: string;
  module_title: string;
  module_position: number;
  notion_id: string;
  notion_label: string;
  payload: unknown;
}

export interface NotionStateRow {
  [key: string]: unknown;
  mastery: string | number;
  gap_nature: string | null;
}

export interface AttemptRow {
  [key: string]: unknown;
  id: string;
  status: string;
  hints_used: number;
  started_at: Date | string;
  submitted_at: Date | string | null;
  duration_ms: number | null;
  review_feedback: unknown;
  response: unknown;
  feedback: unknown;
  score: string | number | null;
  max_score: string | number | null;
  is_correct: boolean | null;
}

export interface AttemptWithAnswer {
  attempt: AttemptRow;
  submission: unknown;
}

const READABLE_EXERCISE = sql`
  select
    act.id::text as exercise_id,
    act.formation_id::text as formation_id,
    f.title as formation_title,
    act.module_id::text as module_id,
    m.title as module_title,
    m.position as module_position,
    (b.notion_ids)[1]::text as notion_id,
    n.label as notion_label,
    v.payload as payload
  from public.activities act
  join public.formations f on f.id = act.formation_id
  join public.modules m on m.id = act.module_id
  join public.brick_versions v
    on v.id = (act.items -> 0 ->> 'brickVersionId')::uuid
  join public.bricks b on b.id = v.brick_id
  join public.notions n on n.id = (b.notion_ids)[1]
`;

/** Reads one exercise of the current learner, with its immutable instruction payload. */
export async function readExercise(
  tx: DbTx,
  userId: string,
  exerciseId: string,
): Promise<ExerciseRow> {
  const rows = await tx.execute<ExerciseRow>(sql`
    ${READABLE_EXERCISE}
    where act.id = ${exerciseId}::uuid
      and act.owner_id = ${userId}::uuid
      and act.kind = 'exercise'
      and act.status = 'ready'
  `);
  const row = rows[0];
  if (row === undefined) throw new AppError('NOT_FOUND', 'Exercice introuvable.');
  return row;
}

export function instructionOf(row: ExerciseRow): ExerciseInstruction {
  const parsed = ExerciseInstructionSchema.safeParse(row.payload);
  if (!parsed.success) {
    throw new AppError('INTERNAL_ERROR', 'La consigne stockée de l’exercice est invalide.');
  }
  return parsed.data;
}

export async function readNotionState(
  tx: DbTx,
  userId: string,
  notionId: string,
): Promise<NotionStateRow> {
  const rows = await tx.execute<NotionStateRow>(sql`
    select mastery::text as mastery, gap_nature::text as gap_nature
    from public.notion_states
    where user_id = ${userId}::uuid and notion_id = ${notionId}::uuid
  `);
  return rows[0] ?? { mastery: 0, gap_nature: null };
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function numberValue(value: string | number | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Latest attempt of one exercise, with the answer at position 1 (null before any save). */
export async function readLatestAttempt(
  tx: DbTx,
  userId: string,
  exerciseId: string,
): Promise<AttemptWithAnswer | null> {
  const rows = await tx.execute<AttemptRow>(sql`
    select
      a.id::text as id,
      a.status::text as status,
      a.hints_used,
      a.started_at,
      a.submitted_at,
      a.duration_ms,
      a.review_feedback,
      ans.response,
      ans.feedback,
      ans.score,
      ans.max_score,
      ans.is_correct
    from public.attempts a
    left join public.answers ans
      on ans.attempt_id = a.id and ans.position = 1
    where a.user_id = ${userId}::uuid
      and a.activity_id = ${exerciseId}::uuid
    order by a.attempt_no desc
    limit 1
  `);
  const row = rows[0];
  if (row === undefined) return null;
  return { attempt: row, submission: row.response };
}

/** Locks the latest attempt row to serialise hint, draft and submit transitions. */
export async function lockLatestAttempt(
  tx: DbTx,
  userId: string,
  exerciseId: string,
): Promise<AttemptRow | null> {
  const rows = await tx.execute<AttemptRow>(sql`
    select
      a.id::text as id,
      a.status::text as status,
      a.hints_used,
      a.started_at,
      a.submitted_at,
      a.duration_ms,
      a.review_feedback,
      null as response,
      null as feedback,
      null as score,
      null as max_score,
      null as is_correct
    from public.attempts a
    where a.user_id = ${userId}::uuid
      and a.activity_id = ${exerciseId}::uuid
    order by a.attempt_no desc
    limit 1
    for update
  `);
  return rows[0] ?? null;
}

/**
 * Returns the in-progress attempt or creates the next one. Callers must hold the latest attempt
 * lock (or accept that `createAttempt` serialises the numbering itself).
 */
export async function ensureAttempt(
  tx: DbTx,
  userId: string,
  exerciseId: string,
): Promise<{ attemptId: string; hintsUsed: number; status: string; startedAt: Date | string }> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`exercise-attempt:${userId}:${exerciseId}`}, 0))`,
  );
  const last = await lockLatestAttempt(tx, userId, exerciseId);
  if (last !== null && last.status === 'in_progress') {
    return {
      attemptId: last.id,
      hintsUsed: last.hints_used,
      status: last.status,
      startedAt: last.started_at,
    };
  }
  const created = await createAttempt(tx, { userId, activityId: exerciseId });
  return {
    attemptId: created.id,
    hintsUsed: created.hintsUsed,
    status: created.status,
    startedAt: created.startedAt,
  };
}

/** Rewrites the answer at position 1 (draft or final production) without touching the grade. */
export async function upsertAnswer(
  tx: DbTx,
  input: {
    attemptId: string;
    brickVersionId: string;
    response: unknown;
    isCorrect?: boolean | null;
    score?: number | null;
    maxScore?: number | null;
    gradedBy?: 'tutor' | null;
    feedback?: unknown;
    answeredAt: Date;
  },
): Promise<void> {
  await tx.execute(sql`
    insert into public.answers (
      attempt_id, brick_version_id, position, response, is_correct, score, max_score,
      graded_by, feedback, answered_at
    ) values (
      ${input.attemptId}::uuid,
      ${input.brickVersionId}::uuid,
      1,
      ${JSON.stringify(input.response)}::jsonb,
      ${input.isCorrect ?? null},
      ${input.score === null || input.score === undefined ? null : input.score},
      ${input.maxScore === null || input.maxScore === undefined ? null : input.maxScore},
      ${input.gradedBy ?? null}::public.grader,
      ${input.feedback === undefined ? null : JSON.stringify(input.feedback)}::jsonb,
      ${input.answeredAt.toISOString()}::timestamptz
    )
    on conflict (attempt_id, position) do update set
      response = excluded.response,
      is_correct = excluded.is_correct,
      score = excluded.score,
      max_score = excluded.max_score,
      graded_by = excluded.graded_by,
      feedback = excluded.feedback,
      answered_at = excluded.answered_at
  `);
}

/** Reads the brick version recorded by the exercise items, to persist the answer faithfully. */
export async function readBrickVersionId(tx: DbTx, exerciseId: string): Promise<string> {
  const rows = await tx.execute<{ version_id: string }>(sql`
    select (items -> 0 ->> 'brickVersionId') as version_id
    from public.activities
    where id = ${exerciseId}::uuid and owner_id is not null
  `);
  const versionId = rows[0]?.version_id;
  if (versionId === undefined) {
    throw new AppError('INTERNAL_ERROR', 'Version de brique de l’exercice introuvable.');
  }
  return versionId;
}

export function correctionFromAttempt(row: AttemptRow): ExerciseAttempt['correction'] {
  if (row.status !== 'graded') return null;
  if (typeof row.review_feedback !== 'object' || row.review_feedback === null) return null;
  const record = row.review_feedback as Record<string, unknown>;
  const parsed = ExerciseCorrectionSchema.safeParse(record.correction);
  return parsed.success ? parsed.data : null;
}

function masteryFromFeedback(
  row: AttemptRow,
  key: 'masteryBefore' | 'masteryAfter',
): number | null {
  if (typeof row.review_feedback !== 'object' || row.review_feedback === null) return null;
  const value = (row.review_feedback as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function submissionOf(
  instruction: ExerciseInstruction,
  value: unknown,
): ExerciseAttempt['submission'] {
  if (typeof value !== 'object' || value === null) return null;
  const parsed = ExerciseSubmissionSchema.safeParse({
    kind: instruction.production.kind,
    ...(value as Record<string, unknown>),
  });
  return parsed.success ? parsed.data : null;
}

export function attemptDto(
  row: AttemptWithAnswer | null,
  instruction: ExerciseInstruction,
  fallbackMastery: number,
): ExerciseAttempt | null {
  if (row === null) return null;
  const attempt = row.attempt;
  const hintsUsed = Math.max(0, Math.min(2, attempt.hints_used));
  const correction = correctionFromAttempt(attempt);
  const masteryBefore = masteryFromFeedback(attempt, 'masteryBefore') ?? fallbackMastery;
  return ExerciseAttemptSchema.parse({
    attemptId: attempt.id,
    status: attempt.status === 'graded' ? 'graded' : 'in_progress',
    hintsUsed,
    maxScore: Math.max(0, 10 - hintsUsed),
    submission: submissionOf(instruction, row.submission),
    correction,
    masteryBefore,
    masteryAfter: masteryFromFeedback(attempt, 'masteryAfter'),
    startedAt: iso(attempt.started_at),
    submittedAt: attempt.submitted_at === null ? null : iso(attempt.submitted_at),
    durationMs: attempt.duration_ms === null ? null : attempt.duration_ms,
  });
}

export function practiceExerciseDto(
  row: ExerciseRow,
  state: NotionStateRow,
  attempt: AttemptWithAnswer | null,
): PracticeExerciseDto {
  const instruction = instructionOf(row);
  const attemptValue = attemptDto(attempt, instruction, Number(state.mastery));
  const hintsUsed = attemptValue?.hintsUsed ?? 0;
  return PracticeExerciseDto.parse({
    exerciseId: row.exercise_id,
    formationId: row.formation_id,
    formationTitle: row.formation_title,
    moduleId: row.module_id,
    moduleTitle: row.module_title,
    modulePosition: row.module_position,
    notionId: row.notion_id,
    notionLabel: row.notion_label,
    instruction,
    attempt: attemptValue,
    mastery: Number(state.mastery),
    masteryThreshold: ENGINE.mastery.threshold,
    hintsUsed,
    hintsLeft: Math.max(0, 2 - hintsUsed),
    maxScore: Math.max(0, 10 - hintsUsed),
    revealedHints: instruction.hints.slice(0, hintsUsed),
    gapNature:
      state.gap_nature === 'forgetting' ||
      state.gap_nature === 'confusion' ||
      state.gap_nature === 'misunderstanding' ||
      state.gap_nature === 'application'
        ? state.gap_nature
        : null,
  });
}

export { numberValue };
