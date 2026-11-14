// Answer side of the daily warm-up (SPEC-714 EF-8, EF-9, EF-11, ET-4). One transaction records the
// first-pass answer, applies FSRS through the shared application of SPEC-411, moves an « À revoir »
// notion into the evening's global quiz, and queues the `review/answered` event for after the
// commit. A repeated position is a 409 and changes nothing (CL-11); the replay of the card
// (« Recommencer ») never calls this service.
import { randomUUID } from 'node:crypto';

import { sql } from 'drizzle-orm';
import { z } from 'zod';

import type { WarmupDto } from '@learny/contracts';
import { AppError, startOfUserDay, userLocalDay, type Result } from '@learny/core';
import { consumeAutomationAction, upsertDailyActivity, type DbTx } from '@learny/db';
import { withTransaction } from '@learny/jobs';

import type { ServiceContext } from '../context';
import { applyReviewResult } from '../learning/apply-review';
import { requireUser, toResult } from '../resources/result';

import { nextLocalDay, parseWarmupConfig, warmupMinutes, warmupConsumedSummary } from './derive';
import { dbInstant, loadDaySessions, loadWarmupDto } from './get-today';

interface LockedActivityRow {
  [key: string]: unknown;
  id: string;
  formation_id: string;
  module_id: string | null;
  module_position: number | null;
  config: unknown;
  items: unknown;
  status: string;
  for_date: string | null;
  attempt_id: string | null;
  attempt_status: string | null;
  attempt_started_at: Date | string | null;
  attempt_submitted_at: Date | string | null;
  slot_starts_at: Date | string | null;
  review_remaining: boolean | null;
}

interface ItemRef {
  brickId: string;
  brickVersionId: string;
}

interface AnswerRow {
  [key: string]: unknown;
  position: number;
}

interface BrickRow {
  [key: string]: unknown;
  brick_id: string;
  version_id: string;
  type: string;
  notion_ids: string[];
  module_id: string;
}

interface GlobalQuizRow {
  [key: string]: unknown;
  id: string;
  config: unknown;
  items: unknown;
  attempt_id: string | null;
  answer_count: number;
}

interface ActionRow {
  [key: string]: unknown;
  id: string;
  payload: Record<string, unknown>;
}

function itemRefs(raw: unknown): ItemRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item !== 'object' || item === null) return [];
    const record = item as Record<string, unknown>;
    const brickId = typeof record.brickId === 'string' ? record.brickId : '';
    const brickVersionId = typeof record.brickVersionId === 'string' ? record.brickVersionId : '';
    if (brickId === '' || brickVersionId === '') return [];
    return [{ brickId, brickVersionId }];
  });
}

async function lockActivity(
  tx: DbTx,
  userId: string,
  activityId: string,
  today: string,
): Promise<LockedActivityRow> {
  const rows = await tx.execute<LockedActivityRow>(sql`
    select a.id::text as id,
           a.formation_id::text as formation_id,
           a.module_id::text as module_id,
           m.position as module_position,
           a.config,
           a.items,
           a.status::text as status,
           a.for_date::text as for_date,
           t.id::text as attempt_id,
           t.status::text as attempt_status,
           t.started_at as attempt_started_at,
           t.submitted_at as attempt_submitted_at,
           (
             select ss.starts_at
             from public.schedule_slots ss
             where ss.activity_id = a.id
               and ss.status in ('planned', 'done', 'moved')
             order by ss.starts_at desc
             limit 1
           ) as slot_starts_at,
           (
             select (aa.payload ->> 'reviewRemaining')::boolean
             from public.automation_actions aa
             where aa.user_id = a.owner_id
               and aa.automation = 'echauffement'
               and (aa.payload ->> 'activityId') = a.id::text
             order by aa.created_at desc
             limit 1
           ) as review_remaining
    from public.activities a
    left join public.modules m on m.id = a.module_id
    left join public.attempts t
      on t.activity_id = a.id and t.user_id = a.owner_id and t.attempt_no = 1
    where a.id = ${activityId}::uuid
      and a.owner_id = ${userId}::uuid
      and a.kind = 'warmup'
    for update of a
  `);
  const row = rows[0];
  if (row === undefined || row.for_date !== today) {
    throw new AppError('NOT_FOUND', 'Échauffement introuvable.');
  }
  return row;
}

async function ensureAttempt(
  tx: DbTx,
  userId: string,
  activityId: string,
  now: Date,
): Promise<{ attemptId: string; startedAt: Date | string }> {
  const rows = await tx.execute<{ id: string; started_at: Date | string }>(sql`
    insert into public.attempts (
      id, user_id, activity_id, attempt_no, status, started_at, created_at
    ) values (
      ${randomUUID()}::uuid, ${userId}::uuid, ${activityId}::uuid, 1, 'in_progress',
      ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz
    )
    on conflict (activity_id, user_id, attempt_no) do nothing
    returning id::text as id, started_at
  `);
  const created = rows[0];
  if (created !== undefined) return { attemptId: created.id, startedAt: created.started_at };
  const existing = await tx.execute<{ id: string; started_at: Date | string }>(sql`
    select id::text as id, started_at
    from public.attempts
    where activity_id = ${activityId}::uuid and user_id = ${userId}::uuid and attempt_no = 1
  `);
  const row = existing[0];
  if (row === undefined) throw new AppError('INTERNAL_ERROR', 'Tentative d’échauffement absente.');
  return { attemptId: row.id, startedAt: row.started_at };
}

async function brickOf(
  tx: DbTx,
  userId: string,
  formationId: string,
  notionId: string,
): Promise<BrickRow | null> {
  const rows = await tx.execute<BrickRow>(sql`
    select b.id::text as brick_id,
           bv.id::text as version_id,
           b.type::text as type,
           b.notion_ids::text[] as notion_ids,
           n.module_id::text as module_id
    from public.bricks b
    join public.brick_versions bv on bv.brick_id = b.id and bv.version = b.current_version
    join public.notions n on n.id = ${notionId}::uuid
    where b.owner_id = ${userId}::uuid
      and b.formation_id = ${formationId}::uuid
      and b.status = 'active'
      and b.notion_ids @> array[${notionId}::uuid]
    order by (b.type = 'recall_card') desc, b.created_at asc
    limit 1
  `);
  return rows[0] ?? null;
}

async function notionLabel(tx: DbTx, notionId: string): Promise<string | null> {
  const rows = await tx.execute<{ label: string }>(sql`
    select label from public.notions where id = ${notionId}::uuid
  `);
  return rows[0]?.label ?? null;
}

/** EF-8 — due today when the session is not played, tomorrow once it is (CL-8). */
async function rescheduleNotion(
  tx: DbTx,
  userId: string,
  notionId: string,
  today: string,
  timeZone: string,
  dueToday: boolean,
): Promise<void> {
  const dueAt = dueToday
    ? startOfUserDay(today, timeZone)
    : startOfUserDay(nextLocalDay(today), timeZone);
  await tx.execute(sql`
    update public.notion_states
    set due_at = ${dueAt.toISOString()}::timestamptz,
        in_review = true,
        updated_at = ${dueAt.toISOString()}::timestamptz
    where user_id = ${userId}::uuid and notion_id = ${notionId}::uuid
  `);
}

const sessionConfigSchema = z.looseObject({
  dueCount: z.number().int().min(0).optional(),
  estimatedSec: z.number().int().min(0).optional(),
  items: z.array(z.record(z.string(), z.unknown())).optional(),
});

interface SessionAddition {
  nextQuiz: boolean;
}

/**
 * EF-8 — adds the notion at the head of the day's global quiz when it has not started; otherwise
 * the card is due tomorrow. The addition imposes no format (ADR-0193) and preserves « lacunes en
 * tête » by placing the item first (BR-MEM-03).
 */
async function addToEveningQuiz(
  tx: DbTx,
  userId: string,
  formationId: string,
  notionId: string,
  today: string,
  timeZone: string,
): Promise<SessionAddition> {
  const sessions = await tx.execute<GlobalQuizRow>(sql`
    select a.id::text as id,
           a.config,
           a.items,
           t.id::text as attempt_id,
           (
             select count(*)::int from public.answers an where an.attempt_id = t.id
           ) as answer_count
    from public.activities a
    left join public.attempts t
      on t.activity_id = a.id and t.user_id = a.owner_id and t.attempt_no = 1
    where a.owner_id = ${userId}::uuid
      and a.formation_id = ${formationId}::uuid
      and a.kind = 'global_quiz_session'
      and a.for_date = ${today}::date
      and a.status = 'ready'
    order by a.created_at desc
    limit 1
  `);
  const session = sessions[0];
  if (session === undefined) {
    await rescheduleNotion(tx, userId, notionId, today, timeZone, true);
    return { nextQuiz: false };
  }
  if (session.answer_count > 0) {
    await rescheduleNotion(tx, userId, notionId, today, timeZone, false);
    return { nextQuiz: true };
  }
  const brick = await brickOf(tx, userId, formationId, notionId);
  const config = sessionConfigSchema.safeParse(session.config);
  if (brick === null || !config.success) {
    await rescheduleNotion(tx, userId, notionId, today, timeZone, true);
    return { nextQuiz: false };
  }
  const refs = itemRefs(session.items);
  const configItems = config.data.items ?? [];
  const shifted = configItems.map((item) => ({
    ...item,
    position: Number(item.position ?? 0) + 1,
  }));
  const nextConfig = {
    ...(session.config as Record<string, unknown>),
    dueCount: (config.data.dueCount ?? configItems.length) + 1,
    estimatedSec: (config.data.estimatedSec ?? 0) + 45,
    items: [
      {
        position: 0,
        format: brick.type,
        reasonKey: null,
        displayLabel: 'Rappel de l’échauffement',
        moduleIds: [brick.module_id],
        notionIds: [notionId],
      },
      ...shifted,
    ],
  };
  await tx.execute(sql`
    update public.activities
    set config = ${JSON.stringify(nextConfig)}::jsonb,
        items = ${JSON.stringify([{ brickId: brick.brick_id, brickVersionId: brick.version_id }, ...refs])}::jsonb
    where id = ${session.id}::uuid
  `);
  await rescheduleNotion(tx, userId, notionId, today, timeZone, true);
  return { nextQuiz: false };
}

async function actionOfActivity(
  tx: DbTx,
  userId: string,
  activityId: string,
): Promise<ActionRow | null> {
  const rows = await tx.execute<ActionRow>(sql`
    select id::text as id, payload
    from public.automation_actions
    where user_id = ${userId}::uuid
      and automation = 'echauffement'
      and status = 'applied'
      and (payload ->> 'activityId') = ${activityId}
    order by created_at desc
    limit 1
  `);
  return rows[0] ?? null;
}

async function completeFirstPass(
  tx: DbTx,
  userId: string,
  activity: LockedActivityRow,
  attemptId: string,
  startedAt: Date | string,
  now: Date,
  timeZone: string,
  knewCount: number,
  total: number,
  reviewNotionIds: readonly string[],
  nextQuiz: boolean,
): Promise<void> {
  const minutes = warmupMinutes(dbInstant(startedAt), now.toISOString());
  const durationMs = Math.max(0, now.getTime() - new Date(dbInstant(startedAt)).getTime());
  const score = total === 0 ? null : Math.round((knewCount / total) * 100);
  await tx.execute(sql`
    update public.attempts
    set status = 'graded',
        submitted_at = ${now.toISOString()}::timestamptz,
        duration_ms = ${durationMs},
        score = ${score === null ? null : String(score)}
    where id = ${attemptId}::uuid
  `);
  const config = parseWarmupConfig(activity.config);
  if (config.slotId !== undefined) {
    await tx.execute(sql`
      update public.schedule_slots
      set status = 'done', updated_at = ${now.toISOString()}::timestamptz
      where id = ${config.slotId}::uuid and user_id = ${userId}::uuid and status = 'planned'
    `);
  }
  await upsertDailyActivity(tx, {
    userId,
    day: userLocalDay(now, timeZone),
    minutes,
    qualifying: false,
    sources: [`warmup:${activity.id}`],
  });
  const action = await actionOfActivity(tx, userId, activity.id);
  if (action === null) return;
  const labels: string[] = [];
  for (const notionId of reviewNotionIds) {
    const label = await notionLabel(tx, notionId);
    if (label !== null) labels.push(label);
  }
  const payload = {
    ...action.payload,
    knewCount,
    reviewNotionIds: [...reviewNotionIds],
    reviewNotionLabels: labels,
    reviewRemaining: nextQuiz,
  };
  await tx.execute(sql`
    update public.automation_actions
    set payload = ${JSON.stringify(payload)}::jsonb,
        summary = ${warmupConsumedSummary({ knewCount, count: total, reviewLabels: labels, nextQuiz })}
    where id = ${action.id}::uuid and user_id = ${userId}::uuid
  `);
  await consumeAutomationAction(tx, { actionId: action.id, userId });
}

export interface AnswerWarmupInput {
  activityId: string;
  position: number;
  knew: boolean;
}

/** ET-2, EF-8 — records one first-pass answer and returns the updated DTO. */
export function answerWarmup(
  ctx: ServiceContext,
  input: AnswerWarmupInput,
): Promise<Result<WarmupDto>> {
  return toResult(async () => {
    const user = requireUser(ctx);
    if (!z.uuid().safeParse(input.activityId).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant d’échauffement invalide.');
    }
    if (!Number.isInteger(input.position) || input.position < 0) {
      throw new AppError('VALIDATION_FAILED', 'Position de question invalide.', {
        errors: [{ path: 'position', message: 'entier positif ou nul attendu' }],
      });
    }
    const now = ctx.clock.now();
    return withTransaction(user.db, async (tx, outbox) => {
      const timeZone = await (async () => {
        const rows = await tx.execute<{ timezone: string }>(sql`
          select timezone from public.profiles where id = ${user.userId}::uuid
        `);
        return rows[0]?.timezone ?? 'Europe/Paris';
      })();
      const today = userLocalDay(now, timeZone);
      const activity = await lockActivity(tx, user.userId, input.activityId, today);
      if (activity.status !== 'ready') {
        throw new AppError('CONFLICT', 'Cet échauffement n’est plus disponible.');
      }
      const refs = itemRefs(activity.items);
      if (input.position >= refs.length) {
        throw new AppError('VALIDATION_FAILED', 'Position de question hors bornes.', {
          errors: [{ path: 'position', message: 'position dans l’échauffement attendue' }],
        });
      }
      const { attemptId, startedAt } = await ensureAttempt(tx, user.userId, activity.id, now);
      const existing = await tx.execute<AnswerRow>(sql`
        select position from public.answers where attempt_id = ${attemptId}::uuid
      `);
      if (existing.some((row) => row.position === input.position + 1)) {
        throw new AppError(
          'CONFLICT',
          'Cette question a déjà été répondue : rechargez l’échauffement pour voir son état.',
        );
      }
      const ref = refs[input.position];
      if (ref === undefined) throw new AppError('VALIDATION_FAILED', 'Question introuvable.');
      const brickRows = await tx.execute<BrickRow>(sql`
        select b.id::text as brick_id,
               bv.id::text as version_id,
               b.type::text as type,
               b.notion_ids::text[] as notion_ids,
               n.module_id::text as module_id
        from public.brick_versions bv
        join public.bricks b on b.id = bv.brick_id
        join public.notions n on n.id = b.notion_ids[1]
        where bv.id = ${ref.brickVersionId}::uuid
      `);
      const brick = brickRows[0];
      if (brick === undefined) {
        throw new AppError('NOT_FOUND', 'Question d’échauffement introuvable.');
      }
      const answerId = randomUUID();
      await tx.execute(sql`
        insert into public.answers (
          id, attempt_id, brick_version_id, position, response, is_correct,
          score, max_score, time_ms, graded_by, feedback, answered_at
        ) values (
          ${answerId}::uuid, ${attemptId}::uuid, ${ref.brickVersionId}::uuid,
          ${input.position + 1}, ${JSON.stringify({ knew: input.knew })}::jsonb, ${input.knew},
          ${input.knew ? '1' : '0'}, '1', 0, 'code', null, ${now.toISOString()}::timestamptz
        )
      `);
      const notionId = brick.notion_ids[0];
      if (notionId !== undefined) {
        await applyReviewResult(tx, {
          userId: user.userId,
          notionId,
          source: 'warmup',
          format: brick.type,
          correct: input.knew,
          rating: input.knew ? 'good' : 'again',
          timeMs: 0,
          answerId,
          attemptId,
          attemptNo: 1,
          reviewedAt: now.toISOString(),
        });
        outbox.add(
          'review/answered',
          {
            userId: user.userId,
            notionId,
            source: 'warmup',
            correct: input.knew,
            reviewedAt: now.toISOString(),
          },
          { id: `warmup:${activity.id}:${String(input.position)}` },
        );
      }
      const previous = await actionOfActivity(tx, user.userId, activity.id);
      const previousReview = previous?.payload.reviewNotionIds;
      const reviewNotionIds = new Set<string>(
        Array.isArray(previousReview) ? (previousReview as string[]) : [],
      );
      let nextQuiz = Boolean(previous?.payload.reviewRemaining);
      if (!input.knew && notionId !== undefined) {
        reviewNotionIds.add(notionId);
        const addition = await addToEveningQuiz(
          tx,
          user.userId,
          activity.formation_id,
          notionId,
          today,
          timeZone,
        );
        nextQuiz = nextQuiz || addition.nextQuiz;
      }
      const answered = existing.length + 1;
      if (answered >= refs.length) {
        const previousAnswers = await tx.execute<{ is_correct: boolean | null }>(sql`
          select is_correct from public.answers where attempt_id = ${attemptId}::uuid
        `);
        const totalKnew = previousAnswers.filter((row) => row.is_correct === true).length;
        await completeFirstPass(
          tx,
          user.userId,
          activity,
          attemptId,
          startedAt,
          now,
          timeZone,
          totalKnew,
          refs.length,
          [...reviewNotionIds],
          nextQuiz,
        );
      } else if (previous !== null && reviewNotionIds.size > 0) {
        await tx.execute(sql`
          update public.automation_actions
          set payload = ${JSON.stringify({
            ...previous.payload,
            reviewNotionIds: [...reviewNotionIds],
          })}::jsonb
          where id = ${previous.id}::uuid and user_id = ${user.userId}::uuid
        `);
      }
      const refreshed = await lockActivity(tx, user.userId, activity.id, today);
      const sessions = await loadDaySessions(
        tx,
        user.userId,
        activity.formation_id,
        today,
        timeZone,
      );
      return loadWarmupDto(tx, refreshed, activity.formation_id, timeZone, now, sessions);
    });
  });
}

/** Re-exported for the tests. */
export { dbInstant };
