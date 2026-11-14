import { ENGINE } from '@learny/config/product';
import type { FinalReviewDto } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql, type DbTx } from '@learny/db';
import {
  calculateRetention,
  type RetentionModule,
  type RetentionReview,
} from '@learny/learning-engine';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import {
  buildFinalReview,
  isUuid,
  toIso,
  type FinalReviewFormationRow,
  type FinalReviewMilestoneRow,
  type FinalReviewModuleRow,
  type FinalReviewNotionRow,
  type FinalReviewSlotRow,
} from './final-review';

// Read model of SCR-16 (SPEC-617 EF-1, ET-1, ET-3, ET-5; BR-FOR-12, BR-PRO-03).
//
// Every query runs on the learner's RLS client: another learner's formation is indistinguishable
// from a missing one, and a shared formation only exposes the caller's own notion states, slots
// and reviews. The service never recalculates the programme or calls the AI: it aggregates the
// persisted measurements of SPEC-408 with the learner's current memory state.

interface ProfileRow extends Record<string, unknown> {
  timezone: string;
}

interface RetentionModuleRow extends Record<string, unknown> {
  module_id: string;
  validated_at: Date | string | null;
  notion_ids: string[];
}

interface RetentionReviewRow extends Record<string, unknown> {
  review_id: string;
  notion_id: string;
  reviewed_at: Date | string;
  correct: boolean;
}

interface DueRow extends Record<string, unknown> {
  due_count: number;
}

interface VersionRow extends Record<string, unknown> {
  version: number | null;
}

async function readFormation(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<FinalReviewFormationRow> {
  const rows = await tx.execute<FinalReviewFormationRow>(sql`
    select f.id::text as id,
           f.owner_id::text as owner_id,
           f.title,
           f.monogram,
           f.accent_color::text as accent,
           f.status::text as status,
           f.default_threshold::int as default_threshold,
           f.start_date::text as start_date,
           f.completed_at,
           f.maintenance_mode::text as maintenance_mode,
           f.updated_at
    from public.formations f
    where f.id = ${formationId}::uuid
      and (
        f.owner_id = ${userId}::uuid
        or exists (
          select 1
          from public.groups g
          join public.group_members gm on gm.group_id = g.id
          where g.formation_id = f.id
            and gm.user_id = ${userId}::uuid
            and gm.member_status = 'active'
            and gm.left_at is null
        )
      )
    limit 1
  `);
  const formation = rows[0];
  if (formation === undefined) throw new AppError('NOT_FOUND', 'Formation introuvable.');
  return formation;
}

async function readModules(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<FinalReviewModuleRow[]> {
  return tx.execute<FinalReviewModuleRow>(sql`
    select m.id::text as id,
           m.position::int as position,
           m.title,
           m.threshold::int as threshold,
           coalesce(mp.status, m.status)::text as status,
           mp.validated_at,
           mp.best_score::float8 as best_score
    from public.modules m
    left join public.module_progress mp
      on mp.module_id = m.id and mp.user_id = ${userId}::uuid
    where m.formation_id = ${formationId}::uuid
    order by m.position asc, m.id asc
  `);
}

async function readNotions(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<FinalReviewNotionRow[]> {
  return tx.execute<FinalReviewNotionRow>(sql`
    select n.id::text as id,
           n.label,
           n.module_id::text as module_id,
           m.position::int as module_position,
           m.title as module_title,
           coalesce(ns.mastery, 0)::float8 as mastery,
           ns.gap_nature::text as gap_nature,
           ns.gap_evidence,
           conf.label as confused_with_label
    from public.notions n
    join public.modules m on m.id = n.module_id
    left join public.notion_states ns
      on ns.notion_id = n.id and ns.user_id = ${userId}::uuid
    left join public.notions conf on conf.id = ns.gap_confused_with
    where n.formation_id = ${formationId}::uuid
    order by m.position asc, n.position asc, n.id asc
  `);
}

/** CA-3 — the same done/moved rules as the progress indicator of SPEC-408. */
async function readSlots(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<FinalReviewSlotRow[]> {
  return tx.execute<FinalReviewSlotRow>(sql`
    select s.id::text as id,
           s.kind::text as kind,
           s.status::text as status,
           s.starts_at,
           s.ends_at,
           s.moved_from_id::text as moved_from_id
    from public.schedule_slots s
    where s.user_id = ${userId}::uuid
      and s.formation_id = ${formationId}::uuid
      and s.status in ('done', 'planned', 'missed', 'moved', 'cancelled')
    order by s.starts_at asc, s.id asc
  `);
}

/**
 * SPEC-723 EF-3 — sober milestones of the learner: those of the formation plus the global
 * thresholds (100 notions, 30-day streak). A milestone of another formation never appears.
 */
async function readMilestones(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<FinalReviewMilestoneRow[]> {
  return tx.execute<FinalReviewMilestoneRow>(sql`
    select ms.id::text as id,
           ms.key::text as key,
           ms.ref_id::text as ref_id,
           ms.formation_id::text as formation_id,
           f.title as formation_title,
           m.title as module_title,
           ms.achieved_at
    from public.milestones ms
    left join public.formations f on f.id = ms.formation_id
    left join public.modules m on m.id = ms.ref_id
    where ms.user_id = ${userId}::uuid
      and (
        ms.formation_id = ${formationId}::uuid
        or ms.key in ('notions_100', 'streak_30')
      )
    order by ms.achieved_at desc, ms.id asc
  `);
}

async function readRetention(
  tx: DbTx,
  userId: string,
  formationId: string,
  now: Date,
  timeZone: string,
): Promise<{ oneMonth: number | null; twoMonths: number | null }> {
  const moduleRows = await tx.execute<RetentionModuleRow>(sql`
    select m.id::text as module_id,
           mp.validated_at,
           coalesce(array_agg(n.id::text) filter (where n.id is not null), '{}') as notion_ids
    from public.modules m
    join public.module_progress mp on mp.module_id = m.id and mp.user_id = ${userId}::uuid
    left join public.notions n on n.module_id = m.id
    where m.formation_id = ${formationId}::uuid
      and mp.status = 'validated'
      and mp.validated_at is not null
    group by m.id, mp.validated_at
    order by m.position asc, m.id asc
  `);
  const reviewRows = await tx.execute<RetentionReviewRow>(sql`
    select rl.id::text as review_id,
           rl.notion_id::text as notion_id,
           rl.reviewed_at,
           coalesce(rl.correct, false) as correct
    from public.review_logs rl
    join public.notions n on n.id = rl.notion_id
    where rl.user_id = ${userId}::uuid
      and n.formation_id = ${formationId}::uuid
  `);
  const modules: RetentionModule[] = moduleRows.map((row) => ({
    moduleId: row.module_id,
    validatedAt: row.validated_at === null ? null : toIso(row.validated_at),
    notionIds: row.notion_ids,
  }));
  const reviews: RetentionReview[] = reviewRows.map((row) => ({
    reviewId: row.review_id,
    notionId: row.notion_id,
    reviewedAt: toIso(row.reviewed_at),
    correct: row.correct,
  }));
  const horizons = calculateRetention({
    modules,
    reviews,
    at: now.toISOString(),
    timeZone,
    params: {
      horizonsDays: ENGINE.retention.horizonsDays,
      toleranceDays: ENGINE.retention.toleranceDays,
    },
  });
  const one = horizons.find((horizon) => horizon.horizonDays === 30)?.rate ?? null;
  const two = horizons.find((horizon) => horizon.horizonDays === 60)?.rate ?? null;
  return {
    oneMonth: one === null ? null : Math.round(one),
    twoMonths: two === null ? null : Math.round(two),
  };
}

async function readDueCount(
  tx: DbTx,
  userId: string,
  formationId: string,
  now: Date,
): Promise<number> {
  const rows = await tx.execute<DueRow>(sql`
    select count(*)::int as due_count
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    where ns.user_id = ${userId}::uuid
      and n.formation_id = ${formationId}::uuid
      and ns.in_review
      and not ns.suspended
      and ns.due_at <= ${now.toISOString()}::timestamptz
  `);
  return Math.max(0, rows[0]?.due_count ?? 0);
}

async function readProgramVersion(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<number | null> {
  const rows = await tx.execute<VersionRow>(sql`
    select max(version)::int as version
    from public.programme_proposals
    where formation_id = ${formationId}::uuid
      and user_id = ${userId}::uuid
  `);
  return rows[0]?.version ?? null;
}

async function readTimezone(tx: DbTx, userId: string): Promise<string> {
  const rows = await tx.execute<ProfileRow>(sql`
    select timezone from public.profiles where id = ${userId}::uuid
  `);
  return rows[0]?.timezone ?? 'UTC';
}

/**
 * GET /formations/:fid/final-review — bilan final, through a single RLS-scoped snapshot.
 * A malformed identifier is a 400, a foreign formation a 404, and a formation whose modules are
 * not all validated a 409 with no anticipated bilan (ET-5, CL-1).
 */
export function getFinalReview(
  ctx: ServiceContext,
  formationId: string,
): Promise<Result<FinalReviewDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!isUuid(formationId)) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de formation invalide.');
    }
    const now = ctx.clock.now();
    return db.run(async (tx) => {
      const formation = await readFormation(tx, userId, formationId);
      if (formation.status === 'archived') {
        throw new AppError('NOT_FOUND', 'Formation introuvable.');
      }
      const [modules, notions, slots, milestones, timezone] = await Promise.all([
        readModules(tx, userId, formationId),
        readNotions(tx, userId, formationId),
        readSlots(tx, userId, formationId),
        readMilestones(tx, userId, formationId),
        readTimezone(tx, userId),
      ]);
      if (
        formation.status !== 'completed' &&
        !(modules.length > 0 && modules.every((module) => module.status === 'validated'))
      ) {
        throw new AppError(
          'CONFLICT',
          'Le bilan final n’est disponible qu’une fois tous les modules validés.',
          { status: 409 },
        );
      }
      const [retention, dueCount, programVersion] = await Promise.all([
        readRetention(tx, userId, formationId, now, timezone),
        readDueCount(tx, userId, formationId, now),
        readProgramVersion(tx, userId, formationId),
      ]);
      return buildFinalReview({
        formation,
        modules,
        notions,
        slots,
        milestones,
        retention,
        programVersion,
        dueCount,
        now,
        timezone,
      });
    });
  });
}
