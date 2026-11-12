// Repositories of the memory/gap domain (SPEC-107 EF-5, ET-2, ET-5, CL-1 to CL-8).
//
// The FSRS computation and gap detection belong to @learny/learning-engine (SPEC-402 to SPEC-404);
// these functions persist their inputs and outputs. `applyReview`, `detectGap` and `clearGap` lock
// the `(user, notion)` row and check `revision`, so two concurrent answers cannot overwrite an
// applied revision (ET-5, CL-3). Every function takes the caller's transaction: a service composes
// them and commits once, which keeps the state, the review log and the gap event atomic (CA-3).
import { and, asc, eq, lte, sql } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '@learny/core';

import type { DbTx } from '../client';
import {
  gapEvents,
  notionStates,
  reviewLogs,
  type GapEvent,
  type GapEventKindValue,
  type GapNature,
  type NotionState,
  type ReviewLog,
  type ReviewSourceValue,
  type FsrsGradeValue,
} from '../schema/memory';
import {
  FSRS_GRADES,
  GAP_NATURES,
  REVIEW_SOURCES,
  gapEvidenceSchema,
  masterySchema,
  revisionSchema,
  successCountSchema,
  timeMsSchema,
  toFsrsCardJson,
  type FsrsCardInput,
  type FsrsCardJson,
  type GapEvidence,
} from '../schema/memory-json';

const uuidSchema = z.uuid();
const gapNatureSchema = z.enum(GAP_NATURES);
const reviewSourceSchema = z.enum(REVIEW_SOURCES);
const fsrsGradeSchema = z.enum(FSRS_GRADES);

function validationError(field: string, issues: string[]): AppError {
  return new AppError('VALIDATION_FAILED', `Champ « ${field} » invalide : ${issues.join(' ; ')}`, {
    errors: issues.map((message) => ({ path: field, message })),
  });
}

function parse<T>(schema: z.ZodType<T>, value: unknown, field: string): T {
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

/** ET-2 — validates and canonicalises a card before it reaches Postgres (CL-1). */
function card(input: FsrsCardInput | FsrsCardJson, field: string): FsrsCardJson {
  try {
    return toFsrsCardJson(input);
  } catch (error) {
    throw validationError(field, [error instanceof Error ? error.message : String(error)]);
  }
}

function instant(value: Date, field: string): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw validationError(field, ['instant invalide']);
  }
  return value;
}

function identifier(value: string, field: string): string {
  return parse(uuidSchema, value, field);
}

function conflict(): AppError {
  return new AppError(
    'CONFLICT',
    'La notion a été révisée entre-temps : relire son état puis réappliquer la révision.',
  );
}

export interface DueNotionStatesInput {
  userId: string;
  now: Date;
}

/**
 * EF-5, CL-7 — due notions of one learner: `in_review = true`, not suspended, `due_at <= now`,
 * ordered by due date then notion identifier for a stable page. The partial index
 * `notion_states_due_idx` serves the predicate without scanning the other learners.
 */
export async function getDueNotionStates(
  tx: DbTx,
  input: DueNotionStatesInput,
): Promise<NotionState[]> {
  const userId = identifier(input.userId, 'userId');
  const now = instant(input.now, 'now');
  return tx
    .select()
    .from(notionStates)
    .where(
      and(
        eq(notionStates.userId, userId),
        eq(notionStates.inReview, true),
        eq(notionStates.suspended, false),
        lte(notionStates.dueAt, now),
      ),
    )
    .orderBy(asc(notionStates.dueAt), asc(notionStates.notionId));
}

export interface NotionStateInput {
  userId: string;
  notionId: string;
}

/** EF-1 — reloads one state; another learner's identifier yields `null` under `userDb`. */
export async function getNotionState(
  tx: DbTx,
  input: NotionStateInput,
): Promise<NotionState | null> {
  const userId = identifier(input.userId, 'userId');
  const notionId = identifier(input.notionId, 'notionId');
  const rows = await tx
    .select()
    .from(notionStates)
    .where(and(eq(notionStates.userId, userId), eq(notionStates.notionId, notionId)));
  return rows[0] ?? null;
}

export interface CreateNotionStateInput extends NotionStateInput {
  fsrs: FsrsCardInput | FsrsCardJson;
  dueAt?: Date | null;
  mastery?: number;
  firstSeenAt?: Date | null;
  lastSeenAt?: Date | null;
  successCount?: number;
  inReview?: boolean;
  suspended?: boolean;
}

export interface CreatedNotionState {
  state: NotionState;
  created: boolean;
}

/**
 * EF-1 — creates the initial state of a notion (possibly before any answer, with `dueAt = null`).
 * An existing row is returned untouched: initialisation never overwrites a revision (ET-5).
 */
export async function createNotionState(
  tx: DbTx,
  input: CreateNotionStateInput,
): Promise<CreatedNotionState> {
  const userId = identifier(input.userId, 'userId');
  const notionId = identifier(input.notionId, 'notionId');
  const fsrs = card(input.fsrs, 'fsrs');
  const mastery = parse(masterySchema, input.mastery ?? 0, 'mastery');
  const successCount = parse(successCountSchema, input.successCount ?? 0, 'successCount');
  const dueAt =
    input.dueAt === undefined || input.dueAt === null ? null : instant(input.dueAt, 'dueAt');
  const firstSeenAt =
    input.firstSeenAt === undefined || input.firstSeenAt === null
      ? null
      : instant(input.firstSeenAt, 'firstSeenAt');
  const lastSeenAt =
    input.lastSeenAt === undefined || input.lastSeenAt === null
      ? null
      : instant(input.lastSeenAt, 'lastSeenAt');

  const inserted = await tx
    .insert(notionStates)
    .values({
      userId,
      notionId,
      fsrs,
      dueAt,
      mastery: String(mastery),
      firstSeenAt,
      lastSeenAt,
      successCount,
      inReview: input.inReview ?? false,
      suspended: input.suspended ?? false,
    })
    .onConflictDoNothing({ target: [notionStates.userId, notionStates.notionId] })
    .returning();
  const created = inserted[0];
  if (created !== undefined) return { state: created, created: true };

  const existing = await getNotionState(tx, { userId, notionId });
  if (existing === null) {
    throw new AppError('INTERNAL_ERROR', 'État de notion introuvable après insertion.');
  }
  return { state: existing, created: false };
}

export interface ApplyReviewInput extends NotionStateInput {
  /** `revision` read before computing the new card; `null` means “no row yet” (ET-5). */
  expectedRevision: number | null;
  fsrsBefore: FsrsCardInput | FsrsCardJson;
  fsrsAfter: FsrsCardInput | FsrsCardJson;
  mastery: number;
  successCount: number;
  inReview: boolean;
  reviewedAt: Date;
  source: ReviewSourceValue;
  grade: FsrsGradeValue;
  correct?: boolean | null;
  timeMs?: number | null;
  answerId?: string | null;
  firstSeenAt?: Date | null;
  lastSeenAt?: Date | null;
  /** Indexed copy of `fsrsAfter.due`; defaults to that exact instant. */
  dueAt?: Date | null;
}

export interface AppliedReview {
  state: NotionState;
  log: ReviewLog;
  created: boolean;
}

/**
 * EF-3, ET-5, CL-3 — applies one revision atomically: locks the state row, checks the expected
 * revision, writes the new card and appends the review log in the same transaction. A concurrent
 * answer with a stale revision gets `CONFLICT` and never overwrites the applied revision. Invalid
 * JSON, dates or bounds are refused before any write (CL-1, CL-2).
 */
export async function applyReview(tx: DbTx, input: ApplyReviewInput): Promise<AppliedReview> {
  const userId = identifier(input.userId, 'userId');
  const notionId = identifier(input.notionId, 'notionId');
  const expectedRevision =
    input.expectedRevision === null
      ? null
      : parse(revisionSchema, input.expectedRevision, 'expectedRevision');
  const fsrsBefore = card(input.fsrsBefore, 'fsrsBefore');
  const fsrsAfter = card(input.fsrsAfter, 'fsrsAfter');
  const mastery = parse(masterySchema, input.mastery, 'mastery');
  const successCount = parse(successCountSchema, input.successCount, 'successCount');
  const reviewedAt = instant(input.reviewedAt, 'reviewedAt');
  const source = parse(reviewSourceSchema, input.source, 'source');
  const grade = parse(fsrsGradeSchema, input.grade, 'grade');
  const timeMs =
    input.timeMs === null || input.timeMs === undefined
      ? null
      : parse(timeMsSchema, input.timeMs, 'timeMs');
  const answerId =
    input.answerId === null || input.answerId === undefined
      ? null
      : identifier(input.answerId, 'answerId');
  const dueAt =
    input.dueAt === undefined || input.dueAt === null
      ? new Date(fsrsAfter.due)
      : instant(input.dueAt, 'dueAt');
  const firstSeenAt =
    input.firstSeenAt === null || input.firstSeenAt === undefined
      ? reviewedAt
      : instant(input.firstSeenAt, 'firstSeenAt');
  const lastSeenAt =
    input.lastSeenAt === null || input.lastSeenAt === undefined
      ? reviewedAt
      : instant(input.lastSeenAt, 'lastSeenAt');

  let state: NotionState;
  let created = false;

  if (expectedRevision === null) {
    const inserted = await tx
      .insert(notionStates)
      .values({
        userId,
        notionId,
        fsrs: fsrsAfter,
        dueAt,
        mastery: String(mastery),
        firstSeenAt,
        lastSeenAt,
        successCount,
        inReview: input.inReview,
        revision: 1,
      })
      .onConflictDoNothing({ target: [notionStates.userId, notionStates.notionId] })
      .returning();
    const row = inserted[0];
    if (row === undefined) throw conflict();
    state = row;
    created = true;
  } else {
    const rows = await tx
      .select()
      .from(notionStates)
      .where(and(eq(notionStates.userId, userId), eq(notionStates.notionId, notionId)))
      .for('update');
    const current = rows[0];
    if (current === undefined) throw new AppError('NOT_FOUND', 'État de notion introuvable.');
    if (current.revision !== expectedRevision) throw conflict();

    const updated = await tx
      .update(notionStates)
      .set({
        fsrs: fsrsAfter,
        dueAt,
        mastery: String(mastery),
        firstSeenAt: current.firstSeenAt ?? firstSeenAt,
        lastSeenAt,
        successCount,
        inReview: input.inReview,
        revision: current.revision + 1,
      })
      .where(and(eq(notionStates.userId, userId), eq(notionStates.notionId, notionId)))
      .returning();
    const row = updated[0];
    if (row === undefined) throw new AppError('NOT_FOUND', 'État de notion introuvable.');
    state = row;
  }

  const logRows = await tx
    .insert(reviewLogs)
    .values({
      userId,
      notionId,
      answerId,
      source,
      grade,
      correct: input.correct ?? null,
      timeMs,
      reviewedAt,
      fsrsBefore,
      fsrsAfter,
    })
    .returning();
  const log = logRows[0];
  if (log === undefined) throw new AppError('INTERNAL_ERROR', 'Révision non journalisée.');
  return { state, log, created };
}

export interface ReviewHistoryInput extends NotionStateInput {
  limit?: number;
}

/** EF-3, CA-4 — chronological revision history of one notion (oldest first). */
export async function getReviewHistory(tx: DbTx, input: ReviewHistoryInput): Promise<ReviewLog[]> {
  const userId = identifier(input.userId, 'userId');
  const notionId = identifier(input.notionId, 'notionId');
  const limit = input.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000) {
    throw validationError('limit', ['un entier entre 1 et 1000 est attendu']);
  }
  return tx
    .select()
    .from(reviewLogs)
    .where(and(eq(reviewLogs.userId, userId), eq(reviewLogs.notionId, notionId)))
    .orderBy(asc(reviewLogs.reviewedAt), asc(reviewLogs.id))
    .limit(limit);
}

export interface DetectGapInput extends NotionStateInput {
  expectedRevision: number;
  nature: GapNature;
  confusedWith?: string | null;
  evidence?: GapEvidence | null;
  detectedAt: Date;
}

export interface GapChange {
  state: NotionState;
  event: GapEvent | null;
  changed: boolean;
}

/**
 * EF-2, EF-4, ET-5 — records or changes the active gap in the same transaction as its event. A
 * `confusion` may keep the notion it is confused with (checked against the same formation by the
 * SQL trigger); the other natures clear it. Detecting the same active nature twice is idempotent.
 */
export async function detectGap(tx: DbTx, input: DetectGapInput): Promise<GapChange> {
  const userId = identifier(input.userId, 'userId');
  const notionId = identifier(input.notionId, 'notionId');
  const expectedRevision = parse(revisionSchema, input.expectedRevision, 'expectedRevision');
  const nature = parse(gapNatureSchema, input.nature, 'nature');
  const detectedAt = instant(input.detectedAt, 'detectedAt');
  const confusedWith =
    input.confusedWith === null || input.confusedWith === undefined
      ? null
      : identifier(input.confusedWith, 'confusedWith');
  if (nature !== 'confusion' && confusedWith !== null) {
    throw validationError('confusedWith', [
      'seule une lacune de nature confusion peut désigner une notion confondue',
    ]);
  }
  if (confusedWith === notionId) {
    throw validationError('confusedWith', ['une notion ne se confond pas avec elle-même']);
  }
  const evidence =
    input.evidence === null || input.evidence === undefined
      ? null
      : parse(gapEvidenceSchema, input.evidence, 'evidence');

  const rows = await tx
    .select()
    .from(notionStates)
    .where(and(eq(notionStates.userId, userId), eq(notionStates.notionId, notionId)))
    .for('update');
  const current = rows[0];
  if (current === undefined) throw new AppError('NOT_FOUND', 'État de notion introuvable.');
  if (current.revision !== expectedRevision) throw conflict();

  const active = current.gapNature !== null && current.gapClearedAt === null;
  if (
    active &&
    current.gapNature === nature &&
    (current.gapConfusedWith ?? null) === confusedWith
  ) {
    return { state: current, event: null, changed: false };
  }

  const kind: GapEventKindValue = active ? 'nature_changed' : 'detected';
  const updated = await tx
    .update(notionStates)
    .set({
      gapNature: nature,
      gapConfusedWith: confusedWith,
      gapDetectedAt: active ? current.gapDetectedAt : detectedAt,
      gapEvidence: evidence === null ? null : JSON.stringify(evidence),
      gapClearedAt: null,
      revision: current.revision + 1,
    })
    .where(and(eq(notionStates.userId, userId), eq(notionStates.notionId, notionId)))
    .returning();
  const state = updated[0];
  if (state === undefined) throw new AppError('NOT_FOUND', 'État de notion introuvable.');

  const eventRows = await tx
    .insert(gapEvents)
    .values({
      userId,
      notionId,
      kind,
      nature,
      evidence,
      createdAt: detectedAt,
    })
    .returning();
  const event = eventRows[0];
  if (event === undefined) throw new AppError('INTERNAL_ERROR', 'Événement de lacune non créé.');
  return { state, event, changed: true };
}

export interface ClearGapInput extends NotionStateInput {
  expectedRevision: number;
  clearedAt: Date;
  evidence?: GapEvidence | null;
}

/**
 * EF-4, CL-4 — clears the active gap and appends one `cleared` event. Clearing an already cleared
 * (or never detected) gap is idempotent: no event, no revision change, no error.
 */
export async function clearGap(tx: DbTx, input: ClearGapInput): Promise<GapChange> {
  const userId = identifier(input.userId, 'userId');
  const notionId = identifier(input.notionId, 'notionId');
  const expectedRevision = parse(revisionSchema, input.expectedRevision, 'expectedRevision');
  const clearedAt = instant(input.clearedAt, 'clearedAt');
  const evidence =
    input.evidence === null || input.evidence === undefined
      ? null
      : parse(gapEvidenceSchema, input.evidence, 'evidence');

  const rows = await tx
    .select()
    .from(notionStates)
    .where(and(eq(notionStates.userId, userId), eq(notionStates.notionId, notionId)))
    .for('update');
  const current = rows[0];
  if (current === undefined) throw new AppError('NOT_FOUND', 'État de notion introuvable.');
  if (current.revision !== expectedRevision) throw conflict();

  const active = current.gapNature !== null && current.gapClearedAt === null;
  if (!active) return { state: current, event: null, changed: false };
  if (current.gapDetectedAt !== null && clearedAt < current.gapDetectedAt) {
    throw validationError('clearedAt', ['la levée précède la détection de la lacune']);
  }

  const updated = await tx
    .update(notionStates)
    .set({
      gapClearedAt: clearedAt,
      revision: current.revision + 1,
    })
    .where(and(eq(notionStates.userId, userId), eq(notionStates.notionId, notionId)))
    .returning();
  const state = updated[0];
  if (state === undefined) throw new AppError('NOT_FOUND', 'État de notion introuvable.');

  const eventRows = await tx
    .insert(gapEvents)
    .values({
      userId,
      notionId,
      kind: 'cleared',
      nature: current.gapNature,
      evidence,
      createdAt: clearedAt,
    })
    .returning();
  const event = eventRows[0];
  if (event === undefined) throw new AppError('INTERNAL_ERROR', 'Événement de lacune non créé.');
  return { state, event, changed: true };
}

/** EF-4, CA-4 — gap history of one notion (oldest first). */
export async function getGapEvents(tx: DbTx, input: ReviewHistoryInput): Promise<GapEvent[]> {
  const userId = identifier(input.userId, 'userId');
  const notionId = identifier(input.notionId, 'notionId');
  return tx
    .select()
    .from(gapEvents)
    .where(and(eq(gapEvents.userId, userId), eq(gapEvents.notionId, notionId)))
    .orderBy(asc(gapEvents.createdAt), asc(gapEvents.id));
}

/** EF-5, ET-5 — one efficient count for the daily quiz header (uses the partial index). */
export async function countDueNotionStates(tx: DbTx, input: DueNotionStatesInput): Promise<number> {
  const userId = identifier(input.userId, 'userId');
  const now = instant(input.now, 'now');
  const rows = await tx.execute<{ count: string }>(sql`
    select count(*)::int as count
    from public.notion_states
    where user_id = ${userId}::uuid
      and in_review
      and not suspended
      and due_at <= ${now.toISOString()}::timestamptz
  `);
  return Number(rows[0]?.count ?? '0');
}
