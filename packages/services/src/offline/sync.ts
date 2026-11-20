// Server side of the offline synchronisation (SPEC-801 ET-6 to ET-8, ADR-0200). Each entry is
// handled in its own transaction, in `answeredAt` order: the server regrades the answer with
// `@learny/bricks` (the client verdict is ignored), applies FSRS with the response instant, and
// records an `offline_sync_receipts` row so a replay is a `duplicate` with no effect. The most
// recent revision always wins: an answer older than an existing `review_logs` row is stored but
// never regresses the current FSRS state.
import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';

import { gradeBrick, type GradeOutcome } from '@learny/bricks';
import {
  OfflineSyncResponseSchema,
  REVIEW_GAME_RESPONSE_SCHEMAS,
  type OfflineEntry,
  type OfflineSyncCode,
  type OfflineSyncResponse,
  type OfflineSyncResult,
  type ReviewGameFormat,
} from '@learny/contracts';
import { startOfUserDay, userLocalDay, type Result } from '@learny/core';
import { upsertDailyActivity, type DbTx } from '@learny/db';
import {
  correctionExplanation,
  toBrickResponse,
  toGameCorrection,
} from '@learny/domain/review/game-response';
import { type FsrsRating } from '@learny/learning-engine';

import type { ServiceContext } from '../context';
import { applyReviewResult } from '../learning/apply-review';
import { requireUser, toResult } from '../resources/result';
import { completeReviewSession } from '../review/global-quiz';

const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export interface SyncRow {
  [key: string]: unknown;
  id: string;
  owner_id: string;
  formation_id: string;
  for_date: string;
  items: unknown;
  attempt_id: string;
  attempt_status: string;
}

/** ET-7 — entries are applied in `answeredAt` order. */
export function orderEntries(entries: readonly OfflineEntry[]): OfflineEntry[] {
  return [...entries].sort((a, b) => a.answeredAt.localeCompare(b.answeredAt));
}

/** ET-7 — an answer can never be in the future: the server clamps it to `now`. */
export function clampAnsweredAt(answeredAt: string, now: Date): string {
  const instant = new Date(answeredAt);
  if (Number.isNaN(instant.getTime())) return now.toISOString();
  return (instant.getTime() > now.getTime() ? now : instant).toISOString();
}

/** ET-7 — older than the local day of the activity or seven days is `EXPIRED`. */
export function isExpired(
  answeredAt: string,
  forDate: string,
  timeZone: string,
  now: Date,
): boolean {
  const instant = new Date(answeredAt).getTime();
  if (Number.isNaN(instant)) return true;
  const dayStart = startOfUserDay(forDate, timeZone).getTime();
  return instant < dayStart || instant < now.getTime() - RETENTION_MS;
}

async function insertReceipt(
  tx: DbTx,
  userId: string,
  clientId: string,
  status: 'applied' | 'conflict' | 'rejected',
  answerId: string | null,
): Promise<boolean> {
  const rows = await tx.execute<{ client_id: string }>(sql`
    insert into public.offline_sync_receipts (user_id, client_id, status, answer_id)
    values (${userId}::uuid, ${clientId}::uuid, ${status}, ${answerId}::uuid)
    on conflict (user_id, client_id) do nothing
    returning client_id::text as client_id
  `);
  return rows.length > 0;
}

async function receiptStatus(tx: DbTx, userId: string, clientId: string): Promise<boolean> {
  const rows = await tx.execute<{ client_id: string }>(sql`
    select client_id::text as client_id
    from public.offline_sync_receipts
    where user_id = ${userId}::uuid and client_id = ${clientId}::uuid
  `);
  return rows.length > 0;
}

async function loadSession(
  ctx: ServiceContext,
  tx: DbTx,
  entry: OfflineEntry,
): Promise<SyncRow | null> {
  const rows = await tx.execute<SyncRow>(sql`
    select
      a.id::text as id,
      a.owner_id::text as owner_id,
      a.formation_id::text as formation_id,
      a.for_date::text as for_date,
      a.items,
      at.id::text as attempt_id,
      at.status::text as attempt_status
    from public.activities a
    join public.attempts at on at.activity_id = a.id
    where a.id = ${entry.sessionId}::uuid
    order by at.attempt_no desc
    limit 1
  `);
  return rows[0] ?? null;
}

/** Checks the session ownership; a foreign session is `FORBIDDEN` (ET-7). */
async function sessionOf(
  ctx: ServiceContext,
  tx: DbTx,
  entry: OfflineEntry,
): Promise<{ row: SyncRow } | { code: OfflineSyncCode }> {
  const row = await loadSession(ctx, tx, entry);
  if (row === null) {
    const foreign =
      ctx.sdb === undefined
        ? []
        : await ctx.sdb.execute<{ owner_id: string }>(sql`
          select owner_id::text as owner_id
          from public.activities
          where id = ${entry.sessionId}::uuid
          limit 1
        `);
    if (foreign[0] !== undefined && foreign[0].owner_id !== ctx.userId) {
      return { code: 'FORBIDDEN' };
    }
    return { code: 'SESSION_NOT_FOUND' };
  }
  if (row.owner_id !== ctx.userId || row.formation_id !== entry.formationId) {
    return { code: 'FORBIDDEN' };
  }
  return { row };
}

interface BrickRow {
  [key: string]: unknown;
  type: string;
  notion_ids: string[];
  status: string;
  payload: unknown;
}

async function loadBrick(
  tx: DbTx,
  entry: OfflineEntry,
  row: SyncRow,
): Promise<{ brick: BrickRow; versionId: string } | null> {
  const items = (row.items ?? []) as { brickVersionId?: string }[];
  const versionId =
    entry.kind === 'answer'
      ? (entry.brickVersionId ?? items[entry.position]?.brickVersionId ?? '')
      : (items[0]?.brickVersionId ?? '');
  if (versionId === '') return null;
  const rows = await tx.execute<BrickRow>(sql`
    select b.type::text as type, b.notion_ids::text[] as notion_ids, b.status::text as status, bv.payload
    from public.brick_versions bv
    join public.bricks b on b.id = bv.brick_id
    where bv.id = ${versionId}::uuid
  `);
  const brick = rows[0];
  return brick === undefined ? null : { brick, versionId };
}

/** Grades the offline answer with the same code as the online route (BR-MEM-05). */
function grade(
  entry: Extract<OfflineEntry, { kind: 'answer' }>,
  brick: BrickRow,
  versionId: string,
): {
  responseToStore: unknown;
  isCorrect: boolean;
  correction: unknown;
  explanation: string | null;
  rating: FsrsRating | null;
  score: number;
  maxScore: number;
} | null {
  const gameSchema =
    brick.type in REVIEW_GAME_RESPONSE_SCHEMAS
      ? REVIEW_GAME_RESPONSE_SCHEMAS[brick.type as ReviewGameFormat]
      : null;
  let response: unknown = entry.response;
  let rating: FsrsRating | null = null;
  let selfGrade: FsrsRating | null = null;
  if (brick.type === 'recall_card') {
    const candidate =
      entry.selfGrade ??
      (typeof response === 'object' && response !== null
        ? ((response as { selfRating?: unknown }).selfRating ??
          (response as { selfGrade?: unknown }).selfGrade)
        : undefined);
    if (
      candidate !== 'again' &&
      candidate !== 'hard' &&
      candidate !== 'good' &&
      candidate !== 'easy'
    ) {
      return null;
    }
    selfGrade = candidate;
    rating = candidate;
    response = { selfGrade: candidate };
  } else if (gameSchema !== null) {
    const parsed = gameSchema.safeParse(response);
    if (!parsed.success) return null;
    response = toBrickResponse(brick.type as ReviewGameFormat, parsed.data);
  }
  const graded = gradeBrick(brick.type as never, brick.payload as never, response, versionId) as {
    ok: boolean;
    value?: GradeOutcome;
    error?: unknown;
  };
  if (!graded.ok || graded.value === undefined) return null;
  const outcome = graded.value;
  let correction: unknown = outcome.correction;
  let explanation: string | null = null;
  if (gameSchema !== null) {
    correction = toGameCorrection(
      brick.type as ReviewGameFormat,
      brick.payload,
      outcome,
      versionId,
    );
    explanation = correctionExplanation(outcome);
  } else if (typeof correction === 'object' && correction !== null && 'explanation' in correction) {
    explanation = (correction as { explanation?: string | null }).explanation ?? null;
  }
  const score =
    gameSchema === null
      ? outcome.isCorrect
        ? 100
        : 0
      : Math.round(outcome.score * 10_000) / 10_000;
  return {
    responseToStore: brick.type === 'recall_card' ? { selfGrade } : (entry.response ?? {}),
    isCorrect: outcome.isCorrect,
    correction,
    explanation,
    rating,
    score,
    maxScore: gameSchema === null ? 100 : 1,
  };
}

interface AnswerApplied {
  correct: boolean | null;
  nextDueAt: string | null;
}

async function applyAnswer(
  ctx: ServiceContext,
  tx: DbTx,
  entry: Extract<OfflineEntry, { kind: 'answer' }>,
  row: SyncRow,
  userId: string,
  reviewedAt: string,
  timeZone: string,
): Promise<
  | { kind: 'ok'; value: AnswerApplied }
  | { kind: 'conflict' }
  | { kind: 'rejected'; code: OfflineSyncCode }
> {
  const existing = await tx.execute<{ id: string }>(sql`
    select id::text as id
    from public.answers
    where attempt_id = ${row.attempt_id}::uuid
      and position = ${entry.position + 1}
    limit 1
  `);
  if (existing[0] !== undefined) return { kind: 'conflict' };

  const loaded = await loadBrick(tx, entry, row);
  if (loaded === null) return { kind: 'rejected', code: 'INVALID_RESPONSE' };
  const { brick, versionId } = loaded;
  if (entry.skipped === true) {
    await tx.execute(sql`
      insert into public.answers
        (id, attempt_id, brick_version_id, position, response, is_correct, score, max_score, time_ms, graded_by, feedback, answered_at)
      values (
        ${randomUUID()}::uuid,
        ${row.attempt_id}::uuid,
        ${versionId}::uuid,
        ${entry.position + 1},
        ${JSON.stringify({ skipped: true })}::jsonb,
        null, null, null,
        ${Math.min(3_600_000, Math.max(0, Math.round(entry.timeMs ?? 0)))},
        'code',
        ${JSON.stringify({ clientAnswerId: entry.clientId, correction: null, explanation: null, offline: true })}::jsonb,
        ${reviewedAt}::timestamptz
      )
    `);
    return { kind: 'ok', value: { correct: null, nextDueAt: null } };
  }
  if (entry.response === undefined && entry.selfGrade === undefined) {
    return { kind: 'rejected', code: 'INVALID_RESPONSE' };
  }
  const graded = grade(entry, brick, versionId);
  if (graded === null) return { kind: 'rejected', code: 'INVALID_RESPONSE' };

  const answerId = randomUUID();
  const timeMs = Math.min(3_600_000, Math.max(0, Math.round(entry.timeMs ?? 0)));
  await tx.execute(sql`
    insert into public.answers
      (id, attempt_id, brick_version_id, position, response, is_correct, score, max_score, time_ms, graded_by, feedback, answered_at)
    values (
      ${answerId}::uuid,
      ${row.attempt_id}::uuid,
      ${versionId}::uuid,
      ${entry.position + 1},
      ${JSON.stringify(graded.responseToStore)}::jsonb,
      ${graded.isCorrect},
      ${graded.score},
      ${graded.maxScore},
      ${timeMs},
      'code',
      ${JSON.stringify({
        clientAnswerId: entry.clientId,
        correction: graded.correction,
        explanation: graded.explanation,
        offline: true,
      })}::jsonb,
      ${reviewedAt}::timestamptz
    )
  `);

  await upsertDailyActivity(tx, {
    userId,
    day: userLocalDay(new Date(reviewedAt), timeZone),
    minutes: Math.max(1, Math.ceil(timeMs / 60_000)),
    qualifying: true,
    sources: [`offline:${entry.clientId}`],
  });

  let nextDueAt: string | null = null;
  const reported = brick.status === 'reported' || brick.status === 'retired';
  if (!reported) {
    const perNotionMs = Math.max(1, Math.round(timeMs / Math.max(1, brick.notion_ids.length)));
    for (const notionId of brick.notion_ids) {
      const applied = await applyReviewResult(tx, {
        userId,
        notionId,
        source: 'offline',
        format: brick.type,
        correct: graded.isCorrect,
        rating: graded.rating,
        timeMs: brick.type === 'recall_card' ? timeMs : perNotionMs,
        answerId,
        attemptId: row.attempt_id,
        attemptNo: 1,
        reviewedAt,
        skipFsrsIfNewer: true,
      });
      if (applied !== null && nextDueAt === null) nextDueAt = applied.dueAt;
    }
  }
  return { kind: 'ok', value: { correct: reported ? null : graded.isCorrect, nextDueAt } };
}

async function processAnswer(
  ctx: ServiceContext,
  entry: Extract<OfflineEntry, { kind: 'answer' }>,
  userId: string,
  timeZone: string,
  now: Date,
): Promise<OfflineSyncResult> {
  const reviewedAt = clampAnsweredAt(entry.answeredAt, now);
  const { db } = requireUser(ctx);
  return db.run(async (tx) => {
    if (await receiptStatus(tx, userId, entry.clientId)) {
      return { clientId: entry.clientId, status: 'duplicate' };
    }
    const found = await sessionOf(ctx, tx, entry);
    if ('code' in found) {
      await insertReceipt(tx, userId, entry.clientId, 'rejected', null);
      return { clientId: entry.clientId, status: 'rejected', code: found.code };
    }
    if (isExpired(reviewedAt, found.row.for_date, timeZone, now)) {
      await insertReceipt(tx, userId, entry.clientId, 'rejected', null);
      return { clientId: entry.clientId, status: 'rejected', code: 'EXPIRED' };
    }
    const applied = await applyAnswer(ctx, tx, entry, found.row, userId, reviewedAt, timeZone);
    if (applied.kind === 'conflict') {
      await insertReceipt(tx, userId, entry.clientId, 'conflict', null);
      return { clientId: entry.clientId, status: 'conflict' };
    }
    if (applied.kind === 'rejected') {
      await insertReceipt(tx, userId, entry.clientId, 'rejected', null);
      return { clientId: entry.clientId, status: 'rejected', code: applied.code };
    }
    const answer = await tx.execute<{ id: string }>(sql`
      select id::text as id from public.answers
      where attempt_id = ${found.row.attempt_id}::uuid
        and position = ${entry.position + 1}
      limit 1
    `);
    await insertReceipt(tx, userId, entry.clientId, 'applied', answer[0]?.id ?? null);
    return {
      clientId: entry.clientId,
      status: 'applied',
      ...(applied.value.correct === null ? {} : { correct: applied.value.correct }),
      ...(applied.value.nextDueAt === null ? {} : { nextDueAt: applied.value.nextDueAt }),
    };
  });
}

async function processComplete(
  ctx: ServiceContext,
  entry: Extract<OfflineEntry, { kind: 'complete' }>,
  userId: string,
  timeZone: string,
  now: Date,
): Promise<OfflineSyncResult> {
  const { db } = requireUser(ctx);
  const duplicate = await db.run((tx) => receiptStatus(tx, userId, entry.clientId));
  if (duplicate) return { clientId: entry.clientId, status: 'duplicate' };
  const session = await db.run(async (tx) => {
    const found = await sessionOf(ctx, tx, entry);
    if ('code' in found) return found;
    if (isExpired(clampAnsweredAt(entry.answeredAt, now), found.row.for_date, timeZone, now)) {
      return { code: 'EXPIRED' } as const;
    }
    return found;
  });
  if ('code' in session) {
    await db.run(async (tx) => {
      await insertReceipt(tx, userId, entry.clientId, 'rejected', null);
    });
    return { clientId: entry.clientId, status: 'rejected', code: session.code };
  }
  const completed = await completeReviewSession(ctx, entry.sessionId);
  if (!completed.ok) {
    await db.run(async (tx) => {
      await insertReceipt(tx, userId, entry.clientId, 'rejected', null);
    });
    return {
      clientId: entry.clientId,
      status: 'rejected',
      code: completed.error.code === 'NOT_FOUND' ? 'SESSION_NOT_FOUND' : 'INVALID_RESPONSE',
    };
  }
  await db.run(async (tx) => {
    await insertReceipt(tx, userId, entry.clientId, 'applied', null);
  });
  return { clientId: entry.clientId, status: 'applied' };
}

async function timeZoneOf(ctx: ServiceContext): Promise<string> {
  const { db } = requireUser(ctx);
  return db.run(async (tx) => {
    const rows = await tx.execute<{ timezone: string }>(sql`
      select timezone from public.profiles where id = ${ctx.userId}::uuid
    `);
    return rows[0]?.timezone ?? 'Europe/Paris';
  });
}

/** ET-6, ET-7 — applies a batch of at most 50 entries, one result per entry. */
export function syncOfflineAnswers(
  ctx: ServiceContext,
  entries: readonly OfflineEntry[],
): Promise<Result<OfflineSyncResponse>> {
  return toResult(async () => {
    const { userId } = requireUser(ctx);
    const now = ctx.clock.now();
    const timeZone = await timeZoneOf(ctx);
    const ordered = orderEntries(entries);
    const results: OfflineSyncResult[] = [];
    for (const entry of ordered) {
      if (entry.kind === 'complete') {
        results.push(await processComplete(ctx, entry, userId, timeZone, now));
      } else {
        results.push(await processAnswer(ctx, entry, userId, timeZone, now));
      }
    }
    const byClient = new Map(results.map((result) => [result.clientId, result]));
    return OfflineSyncResponseSchema.parse({
      results: [...byClient.values()],
    });
  });
}

/** Re-exported for the integration tests: local day of a synchronised answer. */
export function localDayOf(answeredAt: string, timeZone: string): string {
  return userLocalDay(new Date(answeredAt), timeZone);
}
