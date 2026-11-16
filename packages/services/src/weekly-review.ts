// Weekly review service (SPEC-720, BR-AUT-09, ADR-0190, ADR-0047).
//
// `collectWeeklyReviewData` reads the learner's own rows for one local week: done slot minutes,
// the SPEC-408 retention, the notions due or at risk of SPEC-402 and the planned slots of the next
// week (SPEC-407). Every read runs in the caller's transaction, so the automation uses the engine
// transaction and the API uses the RLS client. `getWeeklyReview` projects the latest journal row
// (or one own action) into the home card; a foreign action answers 404 without revealing it.
import { ENGINE } from '@learny/config/product';
import {
  AutomationActionStatus,
  type WeeklyReviewAtRiskNotion,
  type WeeklyReviewDto,
  type WeeklyReviewPlanDay,
  type WeeklyReviewRetention,
  type WeeklyReviewView,
  Uuid,
  WeeklyReviewActionPayload as PayloadSchema,
  type WeeklyReviewActionPayload as WeeklyReviewPayload,
  formatWeeklyStudy,
  isAtRiskNotion,
  sortAtRiskNotions,
  sumPlanMinutes,
  weeklyPeriodLabel,
  weeklyReceivedLabel,
  weeklyRetentionLabel,
  weeklyReviewWeek,
  type AtRiskInput,
  type WeeklyReviewWeek,
} from '@learny/contracts';
import { addCivilDays, AppError, endOfUserDay, startOfUserDay, type Result } from '@learny/core';
import { type Db, type DbTx, sql } from '@learny/db';
import { calculateRetention } from '@learny/learning-engine';

import type { ServiceContext } from './context';
import { requireUser, toResult } from './resources/result';

const RETENTION_HORIZON_DAYS = 30;
const AT_RISK_MASTERY = 60;

interface StudyRow extends Record<string, unknown> {
  minutes: number | null;
}

interface PlanRow extends Record<string, unknown> {
  day: string;
  minutes: number | null;
  slots: number;
}

interface AtRiskRow extends Record<string, unknown> {
  notion_id: string;
  label: string;
  mastery: number | string;
  due_at: Date | string | null;
  gap_nature: string | null;
  gap_cleared_at: Date | string | null;
}

interface RetentionModuleRow extends Record<string, unknown> {
  module_id: string;
  validated_at: Date | string;
  notion_ids: string[];
}

interface RetentionReviewRow extends Record<string, unknown> {
  review_id: string;
  notion_id: string;
  reviewed_at: Date | string;
  correct: boolean;
}

interface ProfileRow extends Record<string, unknown> {
  timezone: string;
}

interface ActionRow extends Record<string, unknown> {
  id: string;
  status: string;
  summary: string;
  payload: Record<string, unknown>;
  created_at: Date | string;
}

export interface WeeklyReviewData {
  studyMinutes: number;
  retention: WeeklyReviewRetention;
  atRiskNotions: WeeklyReviewAtRiskNotion[];
  plan: WeeklyReviewPlanDay[];
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function readStudyMinutes(
  db: Db | DbTx,
  userId: string,
  week: WeeklyReviewWeek,
  timeZone: string,
): Promise<number> {
  const start = startOfUserDay(week.weekStart, timeZone);
  const end = endOfUserDay(week.weekEnd, timeZone);
  const rows = await db.execute<StudyRow>(sql`
    select coalesce(
             sum(extract(epoch from (
               least(ss.ends_at, ${end.toISOString()}::timestamptz)
               - greatest(ss.starts_at, ${start.toISOString()}::timestamptz)
             )) / 60),
             0
           )::int as minutes
    from public.schedule_slots ss
    where ss.user_id = ${userId}::uuid
      and ss.status = 'done'
      and ss.starts_at < ${end.toISOString()}::timestamptz
      and ss.ends_at > ${start.toISOString()}::timestamptz
  `);
  return Math.max(0, rows[0]?.minutes ?? 0);
}

async function readRetention(
  db: Db | DbTx,
  userId: string,
  now: Date,
  timeZone: string,
): Promise<WeeklyReviewRetention> {
  const modules = await db.execute<RetentionModuleRow>(sql`
    select m.id::text as module_id,
           mp.validated_at,
           coalesce(array_agg(n.id::text) filter (where n.id is not null), '{}') as notion_ids
    from public.modules m
    join public.module_progress mp on mp.module_id = m.id and mp.user_id = ${userId}::uuid
    left join public.notions n on n.module_id = m.id
    where mp.status = 'validated' and mp.validated_at is not null
    group by m.id, mp.validated_at
  `);
  const reviews = await db.execute<RetentionReviewRow>(sql`
    select rl.id::text as review_id,
           rl.notion_id::text as notion_id,
           rl.reviewed_at,
           coalesce(rl.correct, false) as correct
    from public.review_logs rl
    join public.notions n on n.id = rl.notion_id
    where rl.user_id = ${userId}::uuid
  `);
  const notionIds = new Set(modules.flatMap((module) => module.notion_ids));
  const horizons = calculateRetention({
    modules: modules.map((module) => ({
      moduleId: module.module_id,
      validatedAt: iso(module.validated_at),
      notionIds: module.notion_ids,
    })),
    reviews: reviews
      .filter((review) => notionIds.has(review.notion_id))
      .map((review) => ({
        reviewId: review.review_id,
        notionId: review.notion_id,
        reviewedAt: iso(review.reviewed_at),
        correct: review.correct,
      })),
    at: now.toISOString(),
    timeZone,
    params: {
      horizonsDays: ENGINE.retention.horizonsDays,
      toleranceDays: ENGINE.retention.toleranceDays,
    },
  });
  const horizon = horizons.find((entry) => entry.horizonDays === RETENTION_HORIZON_DAYS);
  return {
    horizonDays: RETENTION_HORIZON_DAYS,
    rate: horizon?.rate ?? null,
    reviewed: horizon?.reviewed ?? 0,
    successful: horizon?.successful ?? 0,
  };
}

async function readAtRiskNotions(
  db: Db | DbTx,
  userId: string,
  now: Date,
): Promise<WeeklyReviewAtRiskNotion[]> {
  const rows = await db.execute<AtRiskRow>(sql`
    select ns.notion_id::text as notion_id,
           n.label,
           ns.mastery,
           ns.due_at,
           ns.gap_nature::text as gap_nature,
           ns.gap_cleared_at
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    where ns.user_id = ${userId}::uuid
      and not ns.suspended
      and ns.mastery < ${AT_RISK_MASTERY}
      and (
        (ns.gap_nature is not null and ns.gap_cleared_at is null)
        or ns.due_at <= ${now.toISOString()}::timestamptz
      )
    order by ns.mastery asc, n.label asc, ns.notion_id asc
  `);
  const candidates: WeeklyReviewAtRiskNotion[] = [];
  for (const row of rows) {
    const mastery = Number(row.mastery);
    if (!Number.isFinite(mastery)) continue;
    const candidate: AtRiskInput = {
      notionId: row.notion_id,
      label: row.label,
      mastery,
      dueAt: row.due_at === null ? null : iso(row.due_at),
      gapNature: row.gap_nature,
      gapClearedAt: row.gap_cleared_at === null ? null : iso(row.gap_cleared_at),
    };
    if (!isAtRiskNotion(candidate, now)) continue;
    candidates.push({
      notionId: candidate.notionId,
      label: candidate.label,
      mastery: candidate.mastery,
    });
  }
  return sortAtRiskNotions(candidates);
}

async function readNextWeekPlan(
  db: Db | DbTx,
  userId: string,
  week: WeeklyReviewWeek,
  timeZone: string,
): Promise<WeeklyReviewPlanDay[]> {
  const start = startOfUserDay(week.nextWeekStart, timeZone);
  const end = endOfUserDay(addCivilDays(week.nextWeekStart, 6), timeZone);
  const rows = await db.execute<PlanRow>(sql`
    select to_char((ss.starts_at at time zone ${timeZone})::date, 'YYYY-MM-DD') as day,
           coalesce(sum(extract(epoch from (ss.ends_at - ss.starts_at)) / 60), 0)::int as minutes,
           count(*)::int as slots
    from public.schedule_slots ss
    where ss.user_id = ${userId}::uuid
      and ss.status = 'planned'
      and ss.starts_at >= ${start.toISOString()}::timestamptz
      and ss.starts_at < ${end.toISOString()}::timestamptz
    group by 1
    order by 1 asc
  `);
  return rows.map((row) => ({
    date: row.day,
    minutes: Math.max(0, row.minutes ?? 0),
    slots: Math.max(0, row.slots),
  }));
}

/** ET-4 — one aggregation of the four real measures of the week, read under RLS. */
export async function collectWeeklyReviewData(
  db: Db | DbTx,
  input: { userId: string; now: Date; timeZone: string; week: WeeklyReviewWeek },
): Promise<WeeklyReviewData> {
  const [studyMinutes, retention, atRiskNotions, plan] = await Promise.all([
    readStudyMinutes(db, input.userId, input.week, input.timeZone),
    readRetention(db, input.userId, input.now, input.timeZone),
    readAtRiskNotions(db, input.userId, input.now),
    readNextWeekPlan(db, input.userId, input.week, input.timeZone),
  ]);
  return { studyMinutes, retention, atRiskNotions, plan };
}

function viewFromPayload(
  action: ActionRow,
  payload: WeeklyReviewPayload,
  timeZone: string,
): WeeklyReviewView {
  return {
    actionId: action.id,
    status: (AutomationActionStatus.safeParse(action.status).success
      ? action.status
      : 'applied') as WeeklyReviewView['status'],
    createdAt: iso(action.created_at),
    weekKey: payload.weekKey,
    weekStart: payload.weekStart,
    weekEnd: payload.weekEnd,
    nextWeekStart: payload.nextWeekStart,
    periodLabel: weeklyPeriodLabel(payload.weekStart, payload.weekEnd),
    receivedLabel: weeklyReceivedLabel(action.created_at, timeZone),
    studyMinutes: payload.studyMinutes,
    studyLabel: formatWeeklyStudy(payload.studyMinutes),
    retention: payload.retention,
    retentionLabel: weeklyRetentionLabel(payload.retention.rate),
    atRiskNotions: payload.atRiskNotions,
    atRiskCount: payload.atRiskCount,
    plan: payload.plan,
    planMinutes: payload.planMinutes,
    channel: payload.channel,
    availabilityQuestion: true,
    availabilityHref: payload.availabilityHref,
    summary: action.summary,
  };
}

async function viewFromComputed(
  tx: DbTx,
  action: ActionRow,
  userId: string,
  timeZone: string,
): Promise<WeeklyReviewView> {
  const createdAt = new Date(iso(action.created_at));
  const week = weeklyReviewWeek(createdAt, timeZone);
  const data = await collectWeeklyReviewData(tx, {
    userId,
    now: createdAt,
    timeZone,
    week,
  });
  return {
    actionId: action.id,
    status: (AutomationActionStatus.safeParse(action.status).success
      ? action.status
      : 'applied') as WeeklyReviewView['status'],
    createdAt: iso(action.created_at),
    weekKey: week.weekKey,
    weekStart: week.weekStart,
    weekEnd: week.weekEnd,
    nextWeekStart: week.nextWeekStart,
    periodLabel: weeklyPeriodLabel(week.weekStart, week.weekEnd),
    receivedLabel: weeklyReceivedLabel(action.created_at, timeZone),
    studyMinutes: data.studyMinutes,
    studyLabel: formatWeeklyStudy(data.studyMinutes),
    retention: data.retention,
    retentionLabel: weeklyRetentionLabel(data.retention.rate),
    atRiskNotions: data.atRiskNotions,
    atRiskCount: data.atRiskNotions.length,
    plan: data.plan,
    planMinutes: sumPlanMinutes(data.plan),
    channel: 'app',
    availabilityQuestion: true,
    availabilityHref: '/parametres#rythme',
    summary: action.summary,
  };
}

/** EF-2, ET-1, CL-1 — the weekly review of the connected learner, or an explicit empty state. */
export function getWeeklyReview(
  ctx: ServiceContext,
  query: { actionId?: string | undefined } = {},
): Promise<Result<WeeklyReviewDto>> {
  return toResult(async () => {
    const user = requireUser(ctx);
    if (query.actionId !== undefined && !Uuid.safeParse(query.actionId).success) {
      throw new AppError('VALIDATION_FAILED', 'Champ « actionId » invalide : UUID attendu.');
    }
    return user.db.run(async (tx) => {
      const profiles = await tx.execute<ProfileRow>(sql`
        select timezone from public.profiles where id = ${user.userId}::uuid
      `);
      const timezone = profiles[0]?.timezone;
      if (timezone === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');

      const rows =
        query.actionId === undefined
          ? await tx.execute<ActionRow>(sql`
              select id::text as id,
                     status::text as status,
                     summary,
                     payload,
                     created_at
              from public.automation_actions
              where user_id = ${user.userId}::uuid
                and automation = 'bilan'
                and kind = 'weekly_review'
                and status in ('applied', 'consumed')
              order by created_at desc, id desc
              limit 1
            `)
          : await tx.execute<ActionRow>(sql`
              select id::text as id,
                     status::text as status,
                     summary,
                     payload,
                     created_at
              from public.automation_actions
              where id = ${query.actionId}::uuid
                and user_id = ${user.userId}::uuid
                and automation = 'bilan'
              limit 1
            `);
      const action = rows[0];
      if (action === undefined) {
        if (query.actionId !== undefined) {
          throw new AppError('NOT_FOUND', 'Bilan introuvable.');
        }
        return { available: false, review: null, timezone };
      }
      const payload = PayloadSchema.safeParse(action.payload);
      const review = payload.success
        ? viewFromPayload(action, payload.data, timezone)
        : await viewFromComputed(tx, action, user.userId, timezone);
      return { available: true, review, timezone };
    });
  });
}
