import { ENGINE } from '@learny/config/product';
import {
  type MilestoneItem,
  type MilestoneListDto,
  type MilestoneListQuery,
  type NextMilestone,
  type StreakDto,
  type StreakDay,
} from '@learny/contracts';
import { AppError, userLocalDay, type Result } from '@learny/core';
import { serviceDb, sql, type DbTx } from '@learny/db';
import {
  addDays,
  calculateStreak,
  detectMilestones,
  instantAt,
  localDateOf,
  type DailyActivityEntry,
  type DateRange,
  type IsoDate,
  type IsoWeekday,
  type Milestone,
  type StreakCalendarDay,
  type StreakResult,
  type TimeZone,
} from '@learny/learning-engine';
import { notify } from '@learny/notifications';

import type { ServiceContext } from './context';
import { requireUser, toResult } from './resources/result';

// Streak, regularity and milestone interface (SPEC-723 EF-1 to EF-4, ET-1 to ET-5, BR-GAM-02,
// BR-GAM-03, ADR-0321). The engine (SPEC-409) computes the streak from persisted `daily_activity`;
// this service only reads, maps the three engine states to the sidebar boxes and reconciles the
// milestones the learner actually reached. Nothing is recomputed in the browser and no value from
// another learner can appear: every read runs under the caller's RLS client.
//
// Milestones are system-managed (`milestones` is read-only for the authenticated role): after the
// RLS reads, the missing rows are inserted with the owner client in one transaction, then the
// SPEC-209 notification is sent after commit with a stable dedupe key. A replay or two concurrent
// reads therefore produce one row and one notification (CL-2, CL-5, ET-5).

const DEFAULT_STUDY_DAYS: readonly IsoWeekday[] = [1, 2, 3, 4, 5];
const MILESTONE_KEY_ORDER: Record<Milestone['kind'], number> = {
  module_validated: 0,
  notions_100: 1,
  streak_30: 2,
};

interface ProfileRow extends Record<string, unknown> {
  timezone: string;
  current_formation_id: string | null;
}

interface PreferenceRow extends Record<string, unknown> {
  study_days: number[] | string[];
}

interface PauseRow extends Record<string, unknown> {
  starts_on: string;
  ends_on: string;
}

interface ActivityRow extends Record<string, unknown> {
  day: string;
  minutes: number;
  qualifying: boolean;
}

interface ValidatedModuleRow extends Record<string, unknown> {
  id: string;
  formation_id: string;
  title: string;
}

interface CountRow extends Record<string, unknown> {
  count: number;
}

interface OpenModuleRow extends Record<string, unknown> {
  id: string;
  title: string;
}

interface MilestoneRow extends Record<string, unknown> {
  id: string;
  key: string;
  ref_id: string | null;
  formation_id: string | null;
  achieved_at: Date | string;
}

interface MilestoneViewRow extends MilestoneRow {
  formation_title: string | null;
  module_title: string | null;
}

interface SeriesContext {
  timezone: string;
  today: IsoDate;
  currentFormationId: string | null;
  streak: StreakResult;
  validatedModules: ValidatedModuleRow[];
  masteredNotions: number;
  openModule: OpenModuleRow | null;
  previousKeys: string[];
}

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function toStudyDays(row: PreferenceRow | undefined): IsoWeekday[] {
  const raw = row?.study_days ?? DEFAULT_STUDY_DAYS;
  const days = raw
    .map((value) => Number(value))
    .filter((value): value is IsoWeekday => Number.isInteger(value) && value >= 1 && value <= 7);
  return days.length === 0 ? [...DEFAULT_STUDY_DAYS] : [...new Set(days)].sort((a, b) => a - b);
}

function toPauses(rows: readonly PauseRow[]): DateRange[] {
  return rows.map((row) => ({ startsOn: row.starts_on, endsOn: row.ends_on }));
}

/**
 * ET-4 — `daily_activity` is the persisted source: only a qualifying day becomes a
 * `DailyActivityEntry`. The instant is local noon so the engine derives exactly that civil day in
 * the learner's IANA zone, including around a clock change.
 */
function toDailyActivity(rows: readonly ActivityRow[], timezone: TimeZone): DailyActivityEntry[] {
  return rows
    .filter((row) => row.qualifying)
    .map((row) => ({
      at: instantAt(row.day, '12:00', timezone),
      kind: 'quiz' as const,
    }));
}

/** BR-GAM-02 — the engine's three states are exactly the three boxes of the sidebar. */
export function toRegularity(calendar: readonly StreakCalendarDay[]): StreakDay[] {
  return calendar.map((day) => ({
    date: day.date,
    status: day.status === 'studied' ? 'done' : day.status === 'neutral' ? 'neutral' : 'none',
  }));
}

/** BR-GAM-03 — sober label of one milestone; never a ranking or a speed reward. */
export function milestoneLabel(key: string, moduleTitle: string | null = null): string {
  if (key === 'notions_100') return '100 notions retenues';
  if (key === 'streak_30') return '30 jours de série';
  if (key.startsWith('module_validated:')) {
    return moduleTitle === null ? 'Module validé' : `Module « ${moduleTitle} » validé`;
  }
  return 'Jalon atteint';
}

/**
 * ET-3 — the closest remaining milestone. The comparison is bounded and deterministic: the
 * smallest `remaining` wins, then the fixed order module, 100 notions, 30 days. A learner who has
 * reached everything has no next milestone.
 */
export function nextMilestoneOf(input: {
  streakDays: number;
  masteredNotions: number;
  openModule?: { id: string; title: string } | null;
  notionsGoal?: number;
  streakGoal?: number;
}): NextMilestone | null {
  const notionsGoal = input.notionsGoal ?? ENGINE.milestones.notionsRetained;
  const streakGoal = input.streakGoal ?? ENGINE.milestones.streakDays;
  const candidates: NextMilestone[] = [];

  if (input.openModule !== undefined && input.openModule !== null) {
    candidates.push({
      kind: 'module_validated',
      key: `module_validated:${input.openModule.id}`,
      remaining: 1,
      label: `Module « ${input.openModule.title} » à valider`,
    });
  }
  if (input.masteredNotions < notionsGoal) {
    candidates.push({
      kind: 'notions_100',
      key: 'notions_100',
      remaining: notionsGoal - input.masteredNotions,
      label: '100 notions retenues',
    });
  }
  if (input.streakDays < streakGoal) {
    candidates.push({
      kind: 'streak_30',
      key: 'streak_30',
      remaining: streakGoal - input.streakDays,
      label: '30 jours de série',
    });
  }

  candidates.sort(
    (left, right) =>
      left.remaining - right.remaining ||
      MILESTONE_KEY_ORDER[left.kind] - MILESTONE_KEY_ORDER[right.kind] ||
      left.key.localeCompare(right.key),
  );
  return candidates[0] ?? null;
}

async function readProfile(tx: DbTx, userId: string): Promise<ProfileRow> {
  const rows = await tx.execute<ProfileRow>(sql`
    select timezone, current_formation_id::text as current_formation_id
    from public.profiles
    where id = ${userId}::uuid
  `);
  const profile = rows[0];
  if (profile === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  return profile;
}

async function readSeriesContext(ctx: ServiceContext): Promise<SeriesContext> {
  const { userId, db } = requireUser(ctx);
  const now = ctx.clock.now();
  const nowIso = now.toISOString();

  return db.run(async (tx) => {
    const profile = await readProfile(tx, userId);
    const timezone = profile.timezone;
    const today = localDateOf(nowIso, timezone);
    const lookbackStart = addDays(today, -ENGINE.streak.maxLookbackDays);

    const [
      preferences,
      pauses,
      activities,
      validatedModules,
      masteredRows,
      openRows,
      milestoneRows,
    ] = await Promise.all([
      tx.execute<PreferenceRow>(sql`
          select study_days from public.study_preferences where user_id = ${userId}::uuid
        `),
      tx.execute<PauseRow>(sql`
          select starts_on::text as starts_on, ends_on::text as ends_on
          from public.pauses
          where user_id = ${userId}::uuid
          order by starts_on asc, ends_on asc
        `),
      tx.execute<ActivityRow>(sql`
          select day::text as day, minutes::int as minutes, qualifying
          from public.daily_activity
          where user_id = ${userId}::uuid
            and day between ${lookbackStart}::date and ${today}::date
          order by day asc
        `),
      tx.execute<ValidatedModuleRow>(sql`
          select m.id::text as id, m.formation_id::text as formation_id, m.title
          from public.module_progress mp
          join public.modules m on m.id = mp.module_id
          where mp.user_id = ${userId}::uuid and mp.status = 'validated'
          order by m.formation_id asc, m.position asc, m.id asc
        `),
      tx.execute<CountRow>(sql`
          select count(*)::int as count
          from public.notion_states ns
          join public.notions n on n.id = ns.notion_id
          where ns.user_id = ${userId}::uuid
            and ns.mastery >= ${ENGINE.milestones.masteryThreshold}
        `),
      profile.current_formation_id === null
        ? Promise.resolve([] as OpenModuleRow[])
        : tx.execute<OpenModuleRow>(sql`
              select m.id::text as id, m.title
              from public.modules m
              left join public.module_progress mp
                on mp.module_id = m.id and mp.user_id = ${userId}::uuid
              where m.formation_id = ${profile.current_formation_id}::uuid
                and coalesce(mp.status, m.status) = 'open'
              order by m.position asc, m.id asc
              limit 1
            `),
      tx.execute<MilestoneRow>(sql`
          select id::text as id,
                 key::text as key,
                 ref_id::text as ref_id,
                 formation_id::text as formation_id,
                 achieved_at
          from public.milestones
          where user_id = ${userId}::uuid
          order by achieved_at desc, id asc
        `),
    ]);

    const streak = calculateStreak({
      dailyActivity: toDailyActivity(activities, timezone),
      studyDays: toStudyDays(preferences[0]),
      pauses: toPauses(pauses),
      at: nowIso,
      timeZone: timezone,
      params: {
        readingMinSeconds: ENGINE.streak.readingMinSeconds,
        regularityDays: ENGINE.streak.regularityDays,
        maxLookbackDays: ENGINE.streak.maxLookbackDays,
      },
    });

    return {
      timezone,
      today,
      currentFormationId: profile.current_formation_id,
      streak,
      validatedModules,
      masteredNotions: Math.max(0, masteredRows[0]?.count ?? 0),
      openModule: openRows[0] ?? null,
      previousKeys: milestoneRows.map((row) =>
        row.key === 'module_validated' && row.ref_id !== null
          ? `module_validated:${row.ref_id}`
          : row.key,
      ),
    };
  });
}

function buildStreakDto(context: SeriesContext): StreakDto {
  return {
    days: context.streak.days,
    regularity: toRegularity(context.streak.calendar),
    timezone: context.timezone,
    computedOn: context.today,
    nextMilestone: nextMilestoneOf({
      streakDays: context.streak.days,
      masteredNotions: context.masteredNotions,
      openModule:
        context.openModule === null
          ? null
          : { id: context.openModule.id, title: context.openModule.title },
    }),
  };
}

/** ET-3 — `GET /api/v1/streak`, a pure read of the persisted activity and the engine result. */
export function getStreak(ctx: ServiceContext): Promise<Result<StreakDto>> {
  return toResult(async () => buildStreakDto(await readSeriesContext(ctx)));
}

async function insertMilestones(
  userId: string,
  now: Date,
  currentFormationId: string | null,
  validatedModules: readonly ValidatedModuleRow[],
  milestones: readonly Milestone[],
): Promise<MilestoneRow[]> {
  if (milestones.length === 0) return [];
  const formationOfModule = new Map(validatedModules.map((row) => [row.id, row.formation_id]));
  return serviceDb().transaction(async (tx) => {
    const inserted: MilestoneRow[] = [];
    for (const milestone of milestones) {
      const formationId =
        milestone.kind === 'module_validated' && milestone.moduleId !== null
          ? (formationOfModule.get(milestone.moduleId) ?? currentFormationId)
          : currentFormationId;
      const rows = await tx.execute<MilestoneRow>(sql`
        insert into public.milestones (user_id, formation_id, key, ref_id, achieved_at)
        values (
          ${userId}::uuid,
          ${formationId}::uuid,
          ${milestone.kind}::public.milestone_key,
          ${milestone.moduleId}::uuid,
          ${now.toISOString()}::timestamptz
        )
        on conflict (user_id, key, ref_id) do nothing
        returning id::text as id,
                  key::text as key,
                  ref_id::text as ref_id,
                  formation_id::text as formation_id,
                  achieved_at
      `);
      const row = rows[0];
      if (row !== undefined) inserted.push(row);
    }
    return inserted;
  });
}

async function sendMilestoneNotification(
  ctx: ServiceContext,
  userId: string,
  row: MilestoneRow,
): Promise<void> {
  if (row.key !== 'notions_100' && row.key !== 'streak_30') return;
  const result = await notify(
    {
      requestId: ctx.requestId,
      sdb: serviceDb(),
      clock: ctx.clock,
      logger: ctx.logger,
    },
    {
      userId,
      formationId: row.formation_id,
      type: 'milestone',
      data: {
        label: milestoneLabel(row.key),
        href: '/accueil',
      },
      dedupeKey: `milestone:${row.key}`,
    },
  );
  if (!result.ok) {
    ctx.logger.warn('milestones.notify.failed', { outcome: 'notification_failed' });
  }
}

/**
 * ET-2, ET-5 — detects and persists the milestones the learner has actually reached. The engine
 * receives the keys already stored, so a replay never duplicates a milestone; the insertion is one
 * transaction and the notification is sent only for the rows it created, after the commit.
 */
export async function reconcileMilestones(ctx: ServiceContext): Promise<MilestoneRow[]> {
  const { userId } = requireUser(ctx);
  const context = await readSeriesContext(ctx);
  const detected = detectMilestones({
    previousKeys: context.previousKeys,
    validatedModules: context.validatedModules.map((row) => row.id),
    masteredNotions: context.masteredNotions,
    streakDays: context.streak.days,
    params: {
      notionsRetained: ENGINE.milestones.notionsRetained,
      streakDays: ENGINE.milestones.streakDays,
    },
  });
  const inserted = await insertMilestones(
    userId,
    ctx.clock.now(),
    context.currentFormationId,
    context.validatedModules,
    detected,
  );
  for (const row of inserted) {
    await sendMilestoneNotification(ctx, userId, row);
  }
  return inserted;
}

async function assertFormationAccess(tx: DbTx, userId: string, formationId: string): Promise<void> {
  const rows = await tx.execute<{ id: string }>(sql`
    select f.id::text as id
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
  if (rows[0] === undefined) throw new AppError('NOT_FOUND', 'Formation introuvable.');
}

async function readMilestoneItems(
  ctx: ServiceContext,
  timezone: string,
  formationId: string | undefined,
): Promise<MilestoneItem[]> {
  const { userId, db } = requireUser(ctx);
  const filter =
    formationId === undefined
      ? sql`true`
      : sql`(ms.formation_id = ${formationId}::uuid or ms.key in ('notions_100', 'streak_30'))`;
  return db.run(async (tx) => {
    const rows = await tx.execute<MilestoneViewRow>(sql`
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
        and ${filter}
      order by ms.achieved_at desc, ms.id asc
    `);
    return rows.map((row) => ({
      id: row.id,
      key:
        row.key === 'module_validated' && row.ref_id !== null
          ? `module_validated:${row.ref_id}`
          : row.key,
      kind: row.key as MilestoneItem['kind'],
      label: milestoneLabel(
        row.key === 'module_validated' && row.ref_id !== null
          ? `module_validated:${row.ref_id}`
          : row.key,
        row.module_title,
      ),
      formationId: row.formation_id,
      formationTitle: row.formation_title,
      achievedAt: toIso(row.achieved_at),
      achievedOn: userLocalDay(toIso(row.achieved_at), timezone),
    }));
  });
}

/**
 * ET-3, CA-3 — `GET /api/v1/milestones`, newest first. A formation filter is checked under RLS
 * before the read: an unknown or foreign formation is a 404 and never reveals its existence.
 */
export const getMilestones = (
  ctx: ServiceContext,
  query: MilestoneListQuery = {},
): Promise<Result<MilestoneListDto>> =>
  toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (query.formationId !== undefined) {
      await db.run((tx) => assertFormationAccess(tx, userId, query.formationId as string));
    }
    await reconcileMilestones(ctx);
    const context = await readSeriesContext(ctx);
    const items = await readMilestoneItems(ctx, context.timezone, query.formationId);
    return {
      items,
      nextMilestone: buildStreakDto(context).nextMilestone,
      timezone: context.timezone,
    };
  });
