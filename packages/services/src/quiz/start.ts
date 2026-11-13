import { createHash } from 'node:crypto';

import { z } from 'zod';

import type { CreateQuizAttemptOutput } from '@learny/contracts';
import { ENGINE } from '@learny/config/product';
import { AppError, type Result } from '@learny/core';
import { sql, type DbTx } from '@learny/db';
import { withTransaction } from '@learny/jobs';
import {
  drawAttempt,
  type DrawBrick,
  type DrawGap,
  type DrawNotion,
  type GapNature,
} from '@learny/learning-engine';
import { parseBrickPayload, toPublicBrick } from '@learny/bricks';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { quizAttemptGuards } from './guards';
import { requestQuizRegeneration } from './regeneration';

// Creation of one validation attempt (SPEC-611 EF-1, EF-8, ET-3, ET-4, BR-QUI-01 to BR-QUI-03,
// ADR-0014, ADR-0170). Everything runs in the learner's RLS transaction; the draw is pure and
// deterministic, and every question is materialised in `activities.items` so a later threshold
// change never rewrites the attempt (CL-10).

interface ModuleRow extends Record<string, unknown> {
  id: string;
  formation_id: string;
  position: number;
  threshold: number;
  status: 'locked' | 'open' | 'validated';
}

interface NotionRow extends Record<string, unknown> {
  id: string;
  label: string;
  chapter_id: string;
  chapter_position: number;
  position: number;
  mastery: string | number | null;
  gap_nature: string | null;
}

interface BankRow extends Record<string, unknown> {
  brick_id: string;
  version_id: string;
  type: string;
  notion_ids: string[];
  status: string;
  fingerprint: string | null;
  payload: unknown;
}

interface ExistingAttemptRow extends Record<string, unknown> {
  id: string;
}

const UUID = z.uuid();

function attemptSeed(userId: string, moduleId: string, attemptNo: number): string {
  return createHash('sha256')
    .update(`${userId}:${moduleId}:${String(attemptNo)}`, 'utf8')
    .digest('hex');
}

/** BR-QUI-01 — N = min(20, max(12, nombre de notions)), bounded by the engine configuration. */
export function validationQuizSize(notionCount: number): number {
  return Math.min(
    ENGINE.draw.maxSize,
    Math.max(ENGINE.draw.defaultSize, Math.max(1, Math.trunc(notionCount))),
  );
}

/** Deterministic seed of one attempt (hash of learner, module and attempt number). */
export function quizAttemptSeed(userId: string, moduleId: string, attemptNo: number): string {
  return attemptSeed(userId, moduleId, attemptNo);
}

function asArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === 'string');
  }
  if (typeof value === 'string') {
    return value
      .replace(/^\{|\}$/g, '')
      .split(',')
      .map((entry) => entry.trim().replace(/^"|"$/g, ''))
      .filter((entry) => entry !== '');
  }
  return [];
}

function questionType(value: string): 'choice_question' | 'cloze' | 'matching' | 'open_question' | null {
  if (value === 'choice_question' || value === 'cloze' || value === 'matching') return value;
  if (value === 'open_question') return 'open_question';
  return null;
}

async function readModule(tx: DbTx, userId: string, moduleId: string): Promise<ModuleRow> {
  const rows = await tx.execute<ModuleRow>(sql`
    select
      m.id::text as id,
      m.formation_id::text as formation_id,
      m.position,
      m.threshold,
      coalesce(mp.status, m.status)::text as status
    from public.modules m
    join public.formations f on f.id = m.formation_id
    left join public.module_progress mp
      on mp.module_id = m.id and mp.user_id = ${userId}::uuid
    where m.id = ${moduleId}::uuid
      and (f.owner_id = ${userId}::uuid or exists (
        select 1
        from public.groups g
        join public.group_members gm on gm.group_id = g.id
        where g.formation_id = f.id
          and gm.user_id = ${userId}::uuid
          and gm.member_status = 'active'
      ))
    limit 1
  `);
  const module = rows[0];
  if (module === undefined) throw new AppError('NOT_FOUND', 'Module introuvable.');
  return module;
}

async function readNotions(tx: DbTx, moduleId: string, userId: string): Promise<NotionRow[]> {
  return tx.execute<NotionRow>(sql`
    select
      n.id::text as id,
      n.label,
      n.chapter_id::text as chapter_id,
      ch.position as chapter_position,
      n.position,
      ns.mastery::text as mastery,
      ns.gap_nature::text as gap_nature
    from public.notions n
    join public.chapters ch on ch.id = n.chapter_id
    left join public.notion_states ns
      on ns.notion_id = n.id and ns.user_id = ${userId}::uuid
    where n.module_id = ${moduleId}::uuid
    order by ch.position asc, n.position asc, n.id asc
  `);
}

async function readBank(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<{ bank: DrawBrick[]; payloads: Map<string, unknown> }> {
  const rows = await tx.execute<BankRow>(sql`
    select
      b.id::text as brick_id,
      bv.id::text as version_id,
      b.type::text as type,
      b.notion_ids::text[] as notion_ids,
      b.status::text as status,
      bv.fingerprint,
      bv.payload
    from public.bricks b
    join public.brick_versions bv
      on bv.brick_id = b.id and bv.version = b.current_version
    where b.owner_id = ${userId}::uuid
      and b.formation_id = ${formationId}::uuid
      and b.purpose = 'bank'
      and b.status = 'active'
    order by b.id asc
  `);
  const bank: DrawBrick[] = [];
  const payloads = new Map<string, unknown>();
  for (const row of rows) {
    const type = questionType(row.type);
    if (type === null) continue;
    const parsed = parseBrickPayload(type, row.payload);
    if (!parsed.ok) continue;
    payloads.set(row.version_id, row.payload);
    bank.push({
      brickId: row.brick_id,
      brickVersionId: row.version_id,
      notionIds: asArray(row.notion_ids),
      format: type,
      status: 'active',
      valid: true,
      ownedByLearner: true,
      fingerprint: row.fingerprint,
    });
  }
  return { bank, payloads };
}

async function readSeenFingerprints(tx: DbTx, userId: string): Promise<string[]> {
  const rows = await tx.execute<{ fingerprint: string }>(sql`
    select distinct bv.fingerprint
    from public.answers a
    join public.attempts at on at.id = a.attempt_id
    join public.brick_versions bv on bv.id = a.brick_version_id
    where at.user_id = ${userId}::uuid
      and bv.fingerprint is not null
  `);
  return rows.map((row) => row.fingerprint);
}

function drawNotionsOf(
  rows: readonly NotionRow[],
  moduleId: string,
  modulePosition: number,
): DrawNotion[] {
  return rows.map((row) => ({
    notionId: row.id,
    moduleId,
    chapterId: row.chapter_id,
    modulePosition,
    position: row.position,
    label: row.label,
    mastery:
      row.mastery === null || row.mastery === undefined || row.mastery === ''
        ? null
        : Number(row.mastery),
  }));
}

function drawGapsOf(rows: readonly NotionRow[]): DrawGap[] {
  const gaps: DrawGap[] = [];
  for (const row of rows) {
    if (row.gap_nature === null) continue;
    if (
      row.gap_nature === 'forgetting' ||
      row.gap_nature === 'confusion' ||
      row.gap_nature === 'misunderstanding' ||
      row.gap_nature === 'application'
    ) {
      gaps.push({ notionId: row.id, nature: row.gap_nature as GapNature });
    }
  }
  return gaps;
}

async function inProgressAttempt(
  tx: DbTx,
  userId: string,
  moduleId: string,
): Promise<string | null> {
  const rows = await tx.execute<ExistingAttemptRow>(sql`
    select at.id::text as id
    from public.attempts at
    join public.activities act on act.id = at.activity_id
    where at.user_id = ${userId}::uuid
      and act.module_id = ${moduleId}::uuid
      and act.kind = 'validation_quiz'
      and at.status = 'in_progress'
    order by at.created_at desc, at.id desc
    limit 1
  `);
  return rows[0]?.id ?? null;
}

async function nextAttemptNo(tx: DbTx, userId: string, moduleId: string): Promise<number> {
  const rows = await tx.execute<{ count: number }>(sql`
    select count(*)::int as count
    from public.attempts at
    join public.activities act on act.id = at.activity_id
    where at.user_id = ${userId}::uuid
      and act.module_id = ${moduleId}::uuid
      and act.kind = 'validation_quiz'
  `);
  return (rows[0]?.count ?? 0) + 1;
}

/**
 * Starts the validation quiz of one module, or resumes the attempt already in progress (ET-2).
 * A `preparing` result means the bank is exhausted: the caller retries after three seconds (EF-8)
 * and no answer or attempt is created until the tutor has produced new variants.
 */
export function startValidationAttempt(
  ctx: ServiceContext,
  moduleIdValue: string,
): Promise<Result<CreateQuizAttemptOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!UUID.safeParse(moduleIdValue).success) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de module invalide.');
    }
    const moduleId = moduleIdValue;

    for (const guard of quizAttemptGuards) {
      const checked = await guard(ctx, moduleId);
      if (!checked.ok) throw checked.error;
    }

    const existing = await db.run((tx) => inProgressAttempt(tx, userId, moduleId));
    if (existing !== null) return { attemptId: existing, resumed: true as const };

    const startedAt = ctx.clock.now().toISOString();
    const prepared = await withTransaction(db, async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${`quiz-start:${userId}:${moduleId}`}, 0))`,
      );
      const replay = await inProgressAttempt(tx, userId, moduleId);
      if (replay !== null) return { attemptId: replay, resumed: true as const };

      const module = await readModule(tx, userId, moduleId);
      if (module.status === 'locked') {
        throw new AppError('MODULE_LOCKED', 'Ce module est verrouillé.', { status: 422 });
      }
      const notionRows = await readNotions(tx, moduleId, userId);
      if (notionRows.length === 0) {
        throw new AppError('CONFLICT', 'Ce module n’a pas encore de notions.', { status: 409 });
      }

      const size = validationQuizSize(notionRows.length);
      const attemptNo = await nextAttemptNo(tx, userId, moduleId);
      const { bank, payloads } = await readBank(tx, userId, module.formation_id);
      const seen = await readSeenFingerprints(tx, userId);
      const draw = drawAttempt({
        notions: drawNotionsOf(notionRows, module.id, module.position),
        bank,
        seenFingerprints: seen,
        gaps: drawGapsOf(notionRows),
        params: { ...ENGINE.draw, masteryThreshold: ENGINE.mastery.threshold },
        targetCount: size,
        seed: attemptSeed(userId, moduleId, attemptNo),
      });

      const exhaustedNotions = [
        ...new Set(
          draw.exhausted
            .filter((entry) => entry.reason === 'bank_exhausted')
            .map((entry) => entry.notionId),
        ),
      ];
      if (exhaustedNotions.length > 0) {
        await requestQuizRegeneration(tx, ctx, userId, module.formation_id, exhaustedNotions);
        return { preparing: true as const, retryAfterSec: 3 };
      }
      if (draw.questions.length === 0) {
        throw new AppError(
          'CONFLICT',
          'Aucune question disponible pour ce module.',
          { status: 409 },
        );
      }

      const notionLabel = new Map(notionRows.map((notion) => [notion.id, notion.label]));
      const items = draw.questions.map((question) => ({
        brickId: question.brickId,
        brickVersionId: question.brickVersionId,
        points: question.points,
        notionId: question.notionId,
        notionLabel: notionLabel.get(question.notionId) ?? '',
        type: question.format,
        payload: payloads.get(question.brickVersionId) ?? null,
      }));
      const config = {
        threshold: module.threshold,
        questionCount: draw.questions.length,
        scoring: 'equal',
      };
      const activityRows = await tx.execute<{ id: string }>(sql`
        insert into public.activities (
          owner_id, formation_id, module_id, kind, config, items, status
        ) values (
          ${userId}::uuid, ${module.formation_id}::uuid, ${moduleId}::uuid,
          'validation_quiz', ${JSON.stringify(config)}::jsonb,
          ${JSON.stringify(
            items.map((item) => ({
              brickId: item.brickId,
              brickVersionId: item.brickVersionId,
              points: item.points,
            })),
          )}::jsonb,
          'ready'
        )
        returning id::text as id
      `);
      const activityId = activityRows[0]?.id;
      if (activityId === undefined) throw new AppError('INTERNAL_ERROR', 'Activité non créée.');

      // The full item (public payload + notion label) is kept on the activity: GET never needs to
      // reload a bank brick that may have been reported since (CL-9).
      await tx.execute(sql`
        update public.activities
        set items = ${JSON.stringify(items)}::jsonb
        where id = ${activityId}::uuid
      `);

      const attemptRows = await tx.execute<{ id: string }>(sql`
        insert into public.attempts (
          user_id, activity_id, attempt_no, status, started_at
        ) values (
          ${userId}::uuid, ${activityId}::uuid, ${attemptNo}, 'in_progress',
          ${startedAt}::timestamptz
        )
        returning id::text as id
      `);
      const attemptId = attemptRows[0]?.id;
      if (attemptId === undefined) throw new AppError('INTERNAL_ERROR', 'Tentative non créée.');

      for (const [index, question] of draw.questions.entries()) {
        await tx.execute(sql`
          insert into public.answers (
            attempt_id, brick_version_id, position, response, max_score, answered_at
          ) values (
            ${attemptId}::uuid, ${question.brickVersionId}::uuid, ${index + 1},
            '{}'::jsonb, ${question.points}, ${startedAt}::timestamptz
          )
        `);
      }
      return { attemptId };
    });
    return prepared;
  });
}

/** Public projection helper shared by the read model; kept here so both paths use one seed. */
export function publicPayloadOf(
  type: 'choice_question' | 'cloze' | 'matching' | 'open_question',
  payload: unknown,
  brickVersionId: string,
  notionLabels: string[],
): unknown {
  const parsed = parseBrickPayload(type, payload);
  if (!parsed.ok) return null;
  const projected = toPublicBrick({
    brickId: brickVersionId,
    versionId: brickVersionId,
    type,
    notionIds: [],
    payload: parsed.value,
  });
  return { ...projected.publicPayload, notionLabels };
}
