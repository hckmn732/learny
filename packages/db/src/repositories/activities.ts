// Repositories of the brick/activity/attempt domain (SPEC-106 EF-3 to EF-6, ET-4, ET-5).
//
// Every JSON column is validated with the Zod schemas of `bricks-json` before it reaches Postgres.
// `assertActivityItemsOwned` calls the transactional SQL guard of the same name: a ready activity
// cannot reference a missing version, a version of another brick, a brick of another learner, a
// brick of another formation, or a reported/retired brick (BR-BRI-06, ADR-0021). `createAttempt`
// locks the activity row before reading the next attempt number, so two concurrent creations never
// share a number (CL-4). All functions take the caller's transaction: a service composes them and
// commits once.
import { and, eq, sql } from 'drizzle-orm';
import type { ZodType } from 'zod';

import { AppError } from '@learny/core';

import type { DbTx } from '../client';
import {
  activities,
  answers,
  attempts,
  brickVersions,
  bricks,
  type Activity,
  type ActivityKind,
  type ActivityStatus,
  type Answer,
  type Attempt,
  type BrickVersion,
} from '../schema/bricks-activities';
import {
  activityConfigSchema,
  activityItemsSchema,
  answerFeedbackSchema,
  answerResponseSchema,
  attemptPerNotionSchema,
  attemptReviewFeedbackSchema,
  activityItemsErrors,
  brickReportResolutionSchema,
  durationMsSchema,
  positiveVersionSchema,
  scoreSchema,
  type ActivityConfig,
  type ActivityItem,
  type AnswerFeedback,
  type AnswerResponse,
  type AttemptPerNotion,
  type AttemptReviewFeedback,
  type BrickReportResolution,
} from '../schema/bricks-json';

interface Row {
  [key: string]: unknown;
}

function validationError(field: string, issues: string[]): AppError {
  return new AppError('VALIDATION_FAILED', `Champ « ${field} » invalide : ${issues.join(' ; ')}`, {
    errors: issues.map((message) => ({ path: field, message })),
  });
}

function parse<T>(schema: ZodType<T>, value: unknown, field: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw validationError(
      field,
      result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(racine)';
        return `${path} : ${issue.message}`;
      }),
    );
  }
  return result.data;
}

export interface ActivityItemOwnership {
  ownerId: string;
  formationId: string;
  items: unknown;
}

/**
 * ET-5 — transactional assembly guard. Validates the JSON shape, then asks Postgres to verify every
 * `brickVersionId` (version exists, belongs to the brick, brick ownership/formation/status). The SQL
 * function is SECURITY DEFINER but refuses an authenticated caller whose `p_owner_id` is not
 * `auth.uid()`; the repository is therefore safe under `userDb(ctx)` as well as under `serviceDb()`.
 */
export async function assertActivityItemsOwned(
  tx: DbTx,
  input: ActivityItemOwnership,
): Promise<ActivityItem[]> {
  const items = parse(activityItemsSchema, input.items, 'items');
  await tx.execute(sql`
    select public.assert_activity_items_owned(
      ${input.ownerId}::uuid,
      ${input.formationId}::uuid,
      ${JSON.stringify(items)}::jsonb
    )
  `);
  return items;
}

export interface CreateActivityInput {
  ownerId: string;
  formationId: string;
  moduleId?: string | null;
  kind: ActivityKind;
  config?: ActivityConfig;
  items?: ActivityItem[];
  status?: ActivityStatus;
  forDate?: string | null;
}

/**
 * EF-3 — creates an activity. A `ready` activity is checked before the insert: an invalid assembly
 * throws and no partial row is written. `draft` activities may hold an empty item list.
 */
export async function createActivity(tx: DbTx, input: CreateActivityInput): Promise<Activity> {
  const config = parse(activityConfigSchema, input.config ?? {}, 'config');
  const items = parse(activityItemsSchema, input.items ?? [], 'items');
  const status: ActivityStatus = input.status ?? 'draft';
  if (status === 'ready') {
    const issues = activityItemsErrors(items, { ready: true });
    if (issues.length > 0) throw validationError('items', issues);
    await assertActivityItemsOwned(tx, {
      ownerId: input.ownerId,
      formationId: input.formationId,
      items,
    });
  }

  const rows = await tx
    .insert(activities)
    .values({
      ownerId: input.ownerId,
      formationId: input.formationId,
      moduleId: input.moduleId ?? null,
      kind: input.kind,
      config,
      items,
      status,
      forDate: input.forDate ?? null,
    })
    .returning();
  const activity = rows[0];
  if (activity === undefined) throw new AppError('INTERNAL_ERROR', 'Activité non créée.');
  return activity;
}

export interface SetActivityStatusInput {
  activityId: string;
  ownerId: string;
  status: ActivityStatus;
}

/** EF-3 — the transition to `ready` re-checks the whole assembly before the update commits. */
export async function setActivityStatus(
  tx: DbTx,
  input: SetActivityStatusInput,
): Promise<Activity> {
  const rows = await tx
    .select()
    .from(activities)
    .where(and(eq(activities.id, input.activityId), eq(activities.ownerId, input.ownerId)));
  const activity = rows[0];
  if (activity === undefined) throw new AppError('NOT_FOUND', 'Activité introuvable.');

  if (input.status === 'ready') {
    const issues = activityItemsErrors(activity.items, { ready: true });
    if (issues.length > 0) throw validationError('items', issues);
    await assertActivityItemsOwned(tx, {
      ownerId: activity.ownerId,
      formationId: activity.formationId,
      items: activity.items,
    });
  }

  const updated = await tx
    .update(activities)
    .set({ status: input.status })
    .where(and(eq(activities.id, input.activityId), eq(activities.ownerId, input.ownerId)))
    .returning();
  const row = updated[0];
  if (row === undefined) throw new AppError('NOT_FOUND', 'Activité introuvable.');
  return row;
}

export interface AddBrickVersionInput {
  brickId: string;
  version: number;
  payload: Record<string, unknown>;
  origin: 'resource' | 'tutor';
  createdBy: 'tutor' | 'learner' | 'import';
  fingerprint?: string | null;
}

/**
 * EF-2 — appends an immutable version and raises `bricks.current_version`. Postgres refuses any
 * update of the version row (`brick_versions_immutable`), so history is append-only.
 */
export async function addBrickVersion(
  tx: DbTx,
  input: AddBrickVersionInput,
): Promise<BrickVersion> {
  parse(positiveVersionSchema, input.version, 'version');
  const rows = await tx
    .insert(brickVersions)
    .values({
      brickId: input.brickId,
      version: input.version,
      payload: input.payload,
      fingerprint: input.fingerprint ?? null,
      origin: input.origin,
      createdBy: input.createdBy,
    })
    .returning();
  const version = rows[0];
  if (version === undefined) throw new AppError('INTERNAL_ERROR', 'Version de brique non créée.');

  await tx
    .update(bricks)
    .set({
      currentVersion: sql`greatest(${bricks.currentVersion}, ${input.version})`,
    })
    .where(eq(bricks.id, input.brickId));

  return version;
}

export interface CreateAttemptInput {
  userId: string;
  activityId: string;
  deadlineAt?: Date | null;
}

/**
 * EF-4, CL-4 — creates the next attempt of an activity. The activity row is locked first, so the
 * next number is computed in a serialised transaction; the unique constraint is the final backstop.
 */
export async function createAttempt(tx: DbTx, input: CreateAttemptInput): Promise<Attempt> {
  // CL-4 — serialise the numbering per activity. The row lock handles the usual case; the
  // transaction-scoped advisory lock guarantees the order even when the activity row is not yet
  // visible to the competing transaction. The unique constraint is the final backstop.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${input.activityId}, 0))`);
  const locked = await tx
    .select({ id: activities.id, status: activities.status })
    .from(activities)
    .where(and(eq(activities.id, input.activityId), eq(activities.ownerId, input.userId)))
    .for('update');
  const activity = locked[0];
  if (activity === undefined) throw new AppError('NOT_FOUND', 'Activité introuvable.');
  if (activity.status !== 'ready') {
    throw new AppError('VALIDATION_FAILED', 'Une tentative exige une activité prête.');
  }

  const next = await tx.execute<{ attempt_no: number }>(sql`
    select coalesce(max(attempt_no), 0) + 1 as attempt_no
    from public.attempts
    where activity_id = ${input.activityId}::uuid and user_id = ${input.userId}::uuid
  `);
  let attemptNo = next[0]?.attempt_no ?? 1;

  // The unique index is the arbiter. When a concurrent transaction won the number, the insert
  // returns no row; the next iteration re-reads the committed maximum (READ COMMITTED) and takes
  // the following number. Five iterations cover any realistic contention.
  for (let tries = 0; tries < 5; tries += 1) {
    const rows = await tx
      .insert(attempts)
      .values({
        userId: input.userId,
        activityId: input.activityId,
        attemptNo,
        deadlineAt: input.deadlineAt ?? null,
      })
      .onConflictDoNothing({
        target: [attempts.activityId, attempts.userId, attempts.attemptNo],
      })
      .returning();
    const attempt = rows[0];
    if (attempt !== undefined) return attempt;

    const retry = await tx.execute<{ attempt_no: number }>(sql`
      select coalesce(max(attempt_no), 0) + 1 as attempt_no
      from public.attempts
      where activity_id = ${input.activityId}::uuid and user_id = ${input.userId}::uuid
    `);
    attemptNo = retry[0]?.attempt_no ?? attemptNo + 1;
  }

  throw new AppError('INTERNAL_ERROR', 'Numéro de tentative introuvable.');
}

export interface RecordAnswerInput {
  attemptId: string;
  brickVersionId: string;
  position: number;
  response?: AnswerResponse;
  isCorrect?: boolean | null;
  score?: number | null;
  maxScore?: number | null;
  timeMs?: number | null;
  gradedBy?: 'code' | 'tutor' | null;
  feedback?: AnswerFeedback | null;
  chosenDistractorNotionId?: string | null;
  markedForReview?: boolean;
}

/** EF-5 — records one answer at its position; the version shown during the attempt is kept. */
export async function recordAnswer(tx: DbTx, input: RecordAnswerInput): Promise<Answer> {
  if (!Number.isInteger(input.position) || input.position < 1) {
    throw validationError('position', ['position : un entier supérieur ou égal à 1 est attendu']);
  }
  const response = parse(answerResponseSchema, input.response ?? {}, 'response');
  if (input.score !== null && input.score !== undefined) {
    parse(scoreSchema, input.score, 'score');
  }
  if (input.maxScore !== null && input.maxScore !== undefined) {
    parse(scoreSchema, input.maxScore, 'maxScore');
  }
  if (
    input.score !== null &&
    input.score !== undefined &&
    input.maxScore !== null &&
    input.maxScore !== undefined &&
    input.score > input.maxScore
  ) {
    throw validationError('score', ['score ne peut pas dépasser maxScore']);
  }
  if (input.timeMs !== null && input.timeMs !== undefined) {
    parse(durationMsSchema, input.timeMs, 'timeMs');
  }
  const feedback =
    input.feedback === null || input.feedback === undefined
      ? null
      : parse(answerFeedbackSchema, input.feedback, 'feedback');

  const rows = await tx
    .insert(answers)
    .values({
      attemptId: input.attemptId,
      brickVersionId: input.brickVersionId,
      position: input.position,
      response,
      isCorrect: input.isCorrect ?? null,
      score: input.score === null || input.score === undefined ? null : String(input.score),
      maxScore:
        input.maxScore === null || input.maxScore === undefined ? null : String(input.maxScore),
      timeMs: input.timeMs ?? null,
      gradedBy: input.gradedBy ?? null,
      feedback,
      chosenDistractorNotionId: input.chosenDistractorNotionId ?? null,
      markedForReview: input.markedForReview ?? false,
    })
    .returning();
  const answer = rows[0];
  if (answer === undefined) throw new AppError('INTERNAL_ERROR', 'Réponse non enregistrée.');
  return answer;
}

export interface AttemptAnswerDetail {
  position: number;
  answerId: string;
  brickId: string;
  brickVersionId: string;
  brickVersion: number;
  brickType: string;
  response: unknown;
  isCorrect: boolean | null;
  score: number | null;
  maxScore: number | null;
  timeMs: number | null;
  gradedBy: string | null;
}

export interface AttemptDetail {
  attempt: Attempt;
  activity: Activity;
  answers: AttemptAnswerDetail[];
}

/**
 * EF-6, CL-5 — reloads an attempt with the exact brick versions recorded by its answers, even when
 * a newer version was published afterwards. Returns a `NOT_FOUND` for another learner's attempt.
 */
export async function getAttemptWithAnswers(
  tx: DbTx,
  input: { attemptId: string; userId: string },
): Promise<AttemptDetail> {
  const attemptRows = await tx
    .select()
    .from(attempts)
    .where(and(eq(attempts.id, input.attemptId), eq(attempts.userId, input.userId)));
  const attempt = attemptRows[0];
  if (attempt === undefined) throw new AppError('NOT_FOUND', 'Tentative introuvable.');

  const activityRows = await tx
    .select()
    .from(activities)
    .where(eq(activities.id, attempt.activityId));
  const activity = activityRows[0];
  if (activity === undefined) throw new AppError('NOT_FOUND', 'Activité introuvable.');

  const rows = await tx.execute<Row>(sql`
    select
      a.position,
      a.id::text as answer_id,
      v.brick_id::text as brick_id,
      v.id::text as brick_version_id,
      v.version as brick_version,
      b.type::text as brick_type,
      a.response,
      a.is_correct,
      a.score,
      a.max_score,
      a.time_ms,
      a.graded_by::text as graded_by
    from public.answers a
    join public.brick_versions v on v.id = a.brick_version_id
    join public.bricks b on b.id = v.brick_id
    where a.attempt_id = ${input.attemptId}::uuid
    order by a.position
  `);

  return {
    attempt,
    activity,
    answers: rows.map((row) => ({
      position: Number(row.position),
      answerId: String(row.answer_id),
      brickId: String(row.brick_id),
      brickVersionId: String(row.brick_version_id),
      brickVersion: Number(row.brick_version),
      brickType: String(row.brick_type),
      response: row.response,
      isCorrect: typeof row.is_correct === 'boolean' ? row.is_correct : null,
      score: row.score === null || row.score === undefined ? null : Number(row.score),
      maxScore:
        row.max_score === null || row.max_score === undefined ? null : Number(row.max_score),
      timeMs: row.time_ms === null || row.time_ms === undefined ? null : Number(row.time_ms),
      gradedBy: typeof row.graded_by === 'string' ? row.graded_by : null,
    })),
  };
}

export interface ResolveBrickReportInput {
  reportId: string;
  status: 'corrected' | 'dismissed';
  resolution?: BrickReportResolution;
}

/** EF-2 — closes a report; the resolution is validated and `resolved_at` is set by the caller. */
export async function resolveBrickReport(tx: DbTx, input: ResolveBrickReportInput): Promise<void> {
  const resolution =
    input.resolution === undefined
      ? null
      : parse(brickReportResolutionSchema, input.resolution, 'resolution');
  await tx.execute(sql`
    update public.brick_reports
    set status = ${input.status}::public.report_status,
        resolution = ${resolution === null ? null : JSON.stringify(resolution)}::jsonb,
        resolved_at = now()
    where id = ${input.reportId}::uuid and status = 'open'
  `);
}

/** EF-4 — validates the optional structured detail of an attempt before it is persisted. */
export function validateAttemptDetail(input: { perNotion?: unknown; reviewFeedback?: unknown }): {
  perNotion: AttemptPerNotion;
  reviewFeedback: AttemptReviewFeedback | null;
} {
  return {
    perNotion: parse(attemptPerNotionSchema, input.perNotion ?? {}, 'perNotion'),
    reviewFeedback:
      input.reviewFeedback === undefined || input.reviewFeedback === null
        ? null
        : parse(attemptReviewFeedbackSchema, input.reviewFeedback, 'reviewFeedback'),
  };
}
