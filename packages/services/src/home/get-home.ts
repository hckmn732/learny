// Home aggregation of the authenticated learner (SPEC-603 ET-2, BR-PRO-02, BR-PRO-03,
// BR-FOR-13, BR-FOR-16). Everything is read through the learner's RLS client: another learner's
// formations, slots, attempts or memory states never reach the DTO. The service opens the local
// day with `startOfUserDay`/`toUserZone` and never reads a clock itself (ADR-0047). The pure
// derivations of `derive.ts` and the engine functions of SPEC-406/408 build the display values.
import { ENGINE } from '@learny/config/product';
import type {
  CompletedFormationRow,
  HomeDto,
  HomeGlobalQuiz,
  HomeSlot,
  HomeSlotKind,
  OngoingFormationRow,
} from '@learny/contracts';
import { endOfUserDay, startOfUserDay, toUserZone, type Result } from '@learny/core';
import { formationMonogram, sql, type DbTx } from '@learny/db';
import {
  buildDailySession,
  calculateRetention,
  type BrickFormat,
  type GlobalQuizBank,
  type RetentionModule,
  type RetentionReview,
} from '@learny/learning-engine';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import {
  civilDayLabel,
  completedSummary,
  highlightedSlot,
  minutesUntil,
  moduleHref,
  moduleStatusPill,
  deferredDayLabel,
  nextActivityDetail,
  nextActivityLabel,
  objectiveLabels,
  primaryActionFor,
  slotHref,
  slotState,
} from './derive';

const MS_PER_MINUTE = 60_000;
const QUIZ_FORMATS = new Set<string>([
  'choice_question',
  'open_question',
  'cloze',
  'matching',
  'ordering',
  'categorization',
  'recall_card',
]);

interface ProfileRow {
  current_formation_id: string | null;
  timezone: string;
  next_review_at: Date | string | null;
  [key: string]: unknown;
}

interface FormationRow {
  id: string;
  title: string;
  monogram: string;
  accent: string;
  status: 'cadrage' | 'programme_proposed' | 'active' | 'paused' | 'completed' | 'archived';
  description: string | null;
  objectives: string[];
  volume_hours: number | null;
  start_date: string | null;
  end_date: string | null;
  completed_at: Date | string | null;
  maintenance_mode: 'light' | 'stopped' | null;
  last_opened_at: Date | string | null;
  created_at: Date | string;
  module_count: number;
  validated_count: number;
  open_module_id: string | null;
  open_module_position: number | null;
  open_module_title: string | null;
  open_module_threshold: number | null;
  open_module_status: string | null;
  contributions_in_progress: boolean;
  course_status: 'generating' | 'ready' | 'failed' | null;
  reading_percent: number | null;
  attempt_count: number;
  last_score: number | null;
  result_percent: number | null;
  due_count: number;
  cadrage_questions: number;
  [key: string]: unknown;
}

interface SlotRow {
  id: string;
  formation_id: string;
  module_id: string | null;
  activity_id: string | null;
  kind: HomeSlotKind;
  title: string;
  meta: string | null;
  starts_at: Date | string;
  ends_at: Date | string;
  status: 'planned' | 'done' | 'missed';
  [key: string]: unknown;
}

interface RetentionModuleRow {
  formation_id: string;
  module_id: string;
  validated_at: Date | string;
  notion_ids: string[];
  [key: string]: unknown;
}

interface RetentionReviewRow {
  review_id: string;
  notion_id: string;
  reviewed_at: Date | string;
  correct: boolean;
  [key: string]: unknown;
}

interface DueRow {
  notion_id: string;
  module_id: string;
  module_position: number;
  module_status: string;
  evaluated: boolean;
  due_at: Date | string;
  in_review: boolean;
  gap_nature: string | null;
  [key: string]: unknown;
}

interface BrickRow {
  notion_ids: string[];
  type: string;
  [key: string]: unknown;
}

interface RetentionValues {
  oneMonth: number | null;
  twoMonths: number | null;
}

function iso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function addCivilDays(day: string, days: number): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + days));
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${String(shifted.getUTCFullYear())}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

function civilDayOf(value: Date | string, timeZone: string): string {
  return toUserZone(value, timeZone).date;
}

function objectiveText(objectives: string[]): string {
  const labels = objectiveLabels(
    objectives.filter((objective): objective is Parameters<typeof objectiveLabels>[0][number] =>
      ['operational', 'exam', 'dialogue', 'project'].includes(objective),
    ),
  );
  return labels.join(' · ');
}

function firstLineSummary(value: string, max = 60): string {
  const line = value.split(/\r?\n/)[0]?.trim() ?? '';
  if (line.length <= max) return line;
  return `${line.slice(0, max - 1).trimEnd()}…`;
}

function retentionValues(result: ReturnType<typeof calculateRetention>): RetentionValues {
  const one = result.find((horizon) => horizon.horizonDays === 30)?.rate ?? null;
  const two = result.find((horizon) => horizon.horizonDays === 60)?.rate ?? null;
  return {
    oneMonth: one === null ? null : Math.round(one),
    twoMonths: two === null ? null : Math.round(two),
  };
}

async function readProfile(tx: DbTx, userId: string, now: Date): Promise<ProfileRow> {
  const rows = await tx.execute<ProfileRow>(sql`
    select p.current_formation_id::text as current_formation_id,
           p.timezone,
           (
             select min(ns.due_at)
             from public.notion_states ns
             join public.notions n on n.id = ns.notion_id
             where ns.user_id = p.id
               and n.formation_id = p.current_formation_id
               and not ns.suspended
               and ns.due_at > ${now.toISOString()}::timestamptz
           ) as next_review_at
    from public.profiles p
    where p.id = ${userId}::uuid
  `);
  const profile = rows[0];
  if (profile === undefined) {
    throw new Error('Profil introuvable.');
  }
  return profile;
}

async function readFormations(tx: DbTx, userId: string, now: Date): Promise<FormationRow[]> {
  return tx.execute<FormationRow>(sql`
    select f.id::text as id,
           f.title,
           f.monogram,
           f.accent_color::text as accent,
           f.status::text as status,
           f.description,
           f.objectives::text[] as objectives,
           f.volume_hours,
           f.start_date::text as start_date,
           f.end_date::text as end_date,
           f.completed_at,
           f.maintenance_mode::text as maintenance_mode,
           f.last_opened_at,
           f.created_at,
           (
             select count(*)::int from public.modules m where m.formation_id = f.id
           ) as module_count,
           (
             select count(*)::int
             from public.modules m
             join public.module_progress mp on mp.module_id = m.id and mp.user_id = ${userId}::uuid
             where m.formation_id = f.id and mp.status = 'validated'
           ) as validated_count,
           om.id::text as open_module_id,
           om.position as open_module_position,
           om.title as open_module_title,
           om.threshold as open_module_threshold,
           om.status as open_module_status,
           coalesce(om.contributions_in_progress, false) as contributions_in_progress,
           om.course_status,
           om.reading_percent,
           coalesce(om.attempt_count, 0) as attempt_count,
           om.last_score,
           (
             select round(avg(mp.best_score))::int
             from public.module_progress mp
             join public.modules m on m.id = mp.module_id
             where mp.user_id = ${userId}::uuid
               and m.formation_id = f.id
               and mp.best_score is not null
           ) as result_percent,
           (
             select count(*)::int
             from public.notion_states ns
             join public.notions n on n.id = ns.notion_id
             where ns.user_id = ${userId}::uuid
               and n.formation_id = f.id
               and not ns.suspended
               and ns.due_at <= ${now.toISOString()}::timestamptz
           ) as due_count,
           (
             select count(*)::int
             from public.cadrage_messages cm
             where cm.formation_id = f.id and cm.role = 'tutor'
           ) as cadrage_questions
    from public.formations f
    left join lateral (
      select m.id,
             m.position,
             m.title,
             m.threshold,
             coalesce(mp.status, m.status)::text as status,
             exists (
               select 1
               from public.chapters c
               join public.chapter_progress cp on cp.chapter_id = c.id and cp.user_id = ${userId}::uuid
               where c.module_id = m.id and cp.contributions_status = 'in_progress'
             ) as contributions_in_progress,
             (
               select c.status::text
               from public.courses c
               where c.owner_id = ${userId}::uuid and c.module_id = m.id and c.is_current
               limit 1
             ) as course_status,
             (
               select min(rp.percent)
               from public.reading_progress rp
               join public.courses c on c.id = rp.course_id and c.is_current
               where rp.user_id = ${userId}::uuid and c.module_id = m.id
             ) as reading_percent,
             (
               select count(*)::int
               from public.attempts a
               join public.activities act on act.id = a.activity_id
               where a.user_id = ${userId}::uuid
                 and act.module_id = m.id
                 and act.kind = 'validation_quiz'
             ) as attempt_count,
             (
               select a.score::float8
               from public.attempts a
               join public.activities act on act.id = a.activity_id
               where a.user_id = ${userId}::uuid
                 and act.module_id = m.id
                 and act.kind = 'validation_quiz'
               order by a.attempt_no desc, a.started_at desc
               limit 1
             ) as last_score
      from public.modules m
      left join public.module_progress mp on mp.module_id = m.id and mp.user_id = ${userId}::uuid
      where m.formation_id = f.id
        and coalesce(mp.status, m.status) = 'open'
      order by m.position
      limit 1
    ) om on true
    where f.status <> 'archived'
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
    order by f.created_at asc
  `);
}

async function readTodaySlots(
  tx: DbTx,
  userId: string,
  dayStart: Date,
  dayEnd: Date,
): Promise<SlotRow[]> {
  return tx.execute<SlotRow>(sql`
    select ss.id::text as id,
           ss.formation_id::text as formation_id,
           ss.module_id::text as module_id,
           ss.activity_id::text as activity_id,
           ss.kind::text as kind,
           ss.title,
           ss.meta,
           ss.starts_at,
           ss.ends_at,
           ss.status::text as status
    from public.schedule_slots ss
    where ss.user_id = ${userId}::uuid
      and ss.starts_at >= ${dayStart.toISOString()}::timestamptz
      and ss.starts_at < ${dayEnd.toISOString()}::timestamptz
      and ss.status in ('planned', 'done', 'missed')
    order by ss.starts_at, ss.id
  `);
}

async function readNextSlots(tx: DbTx, userId: string, now: Date): Promise<SlotRow[]> {
  return tx.execute<SlotRow>(sql`
    select distinct on (ss.formation_id)
           ss.id::text as id,
           ss.formation_id::text as formation_id,
           ss.module_id::text as module_id,
           ss.activity_id::text as activity_id,
           ss.kind::text as kind,
           ss.title,
           ss.meta,
           ss.starts_at,
           ss.ends_at,
           ss.status::text as status
    from public.schedule_slots ss
    where ss.user_id = ${userId}::uuid
      and ss.status = 'planned'
      and ss.starts_at >= ${now.toISOString()}::timestamptz
    order by ss.formation_id, ss.starts_at
  `);
}

async function readRetention(
  tx: DbTx,
  userId: string,
): Promise<{ modules: RetentionModuleRow[]; reviews: RetentionReviewRow[] }> {
  const modules = await tx.execute<RetentionModuleRow>(sql`
    select m.formation_id::text as formation_id,
           m.id::text as module_id,
           mp.validated_at,
           coalesce(array_agg(n.id::text) filter (where n.id is not null), '{}') as notion_ids
    from public.modules m
    join public.module_progress mp on mp.module_id = m.id and mp.user_id = ${userId}::uuid
    left join public.notions n on n.module_id = m.id
    where mp.status = 'validated' and mp.validated_at is not null
    group by m.formation_id, m.id, mp.validated_at
  `);
  const reviews = await tx.execute<RetentionReviewRow>(sql`
    select rl.id::text as review_id,
           rl.notion_id::text as notion_id,
           rl.reviewed_at,
           coalesce(rl.correct, false) as correct
    from public.review_logs rl
    join public.notions n on n.id = rl.notion_id
    where rl.user_id = ${userId}::uuid
  `);
  return { modules, reviews };
}

function retentionInput(
  rows: { modules: RetentionModuleRow[]; reviews: RetentionReviewRow[] },
  formationId?: string,
): { modules: RetentionModule[]; reviews: RetentionReview[] } {
  const modules = rows.modules
    .filter((row) => formationId === undefined || row.formation_id === formationId)
    .map((row) => ({
      moduleId: row.module_id,
      validatedAt: iso(row.validated_at),
      notionIds: row.notion_ids,
    }));
  const notionIds = new Set(modules.flatMap((module) => module.notionIds));
  const reviews = rows.reviews
    .filter((row) => notionIds.has(row.notion_id))
    .map((row) => ({
      reviewId: row.review_id,
      notionId: row.notion_id,
      reviewedAt: iso(row.reviewed_at),
      correct: row.correct,
    }));
  return { modules, reviews };
}

function computeRetention(
  rows: { modules: RetentionModuleRow[]; reviews: RetentionReviewRow[] },
  now: Date,
  timeZone: string,
  formationId?: string,
): RetentionValues {
  const input = retentionInput(rows, formationId);
  return retentionValues(
    calculateRetention({
      modules: input.modules,
      reviews: input.reviews,
      at: now.toISOString(),
      timeZone,
      params: {
        horizonsDays: ENGINE.retention.horizonsDays,
        toleranceDays: ENGINE.retention.toleranceDays,
      },
    }),
  );
}

async function readDueNotions(
  tx: DbTx,
  userId: string,
  formationId: string,
  now: Date,
): Promise<DueRow[]> {
  return tx.execute<DueRow>(sql`
    select n.id::text as notion_id,
           n.module_id::text as module_id,
           m.position as module_position,
           coalesce(mp.status, m.status)::text as module_status,
           (
             mp.best_score is not null
             or exists (
               select 1
               from public.attempts a
               join public.activities act on act.id = a.activity_id
               where a.user_id = ns.user_id
                 and act.module_id = n.module_id
                 and a.status in ('graded', 'timed_out')
             )
           ) as evaluated,
           ns.due_at,
           ns.in_review,
           ns.gap_nature::text as gap_nature
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    join public.modules m on m.id = n.module_id
    left join public.module_progress mp on mp.module_id = m.id and mp.user_id = ns.user_id
    where ns.user_id = ${userId}::uuid
      and n.formation_id = ${formationId}::uuid
      and not ns.suspended
      and ns.due_at <= ${now.toISOString()}::timestamptz
    order by m.position, ns.due_at, n.position, n.id
  `);
}

async function readBricks(tx: DbTx, userId: string, formationId: string): Promise<BrickRow[]> {
  return tx.execute<BrickRow>(sql`
    select b.notion_ids::text[] as notion_ids, b.type::text as type
    from public.bricks b
    where b.owner_id = ${userId}::uuid
      and b.formation_id = ${formationId}::uuid
      and b.status = 'active'
  `);
}

function globalQuiz(
  formation: FormationRow,
  due: DueRow[],
  bricks: BrickRow[],
  profile: ProfileRow,
  today: string,
  now: Date,
  timeZone: string,
): HomeGlobalQuiz | null {
  const byNotion = new Map<string, Set<BrickFormat>>();
  for (const brick of bricks) {
    if (!QUIZ_FORMATS.has(brick.type)) continue;
    for (const notionId of brick.notion_ids) {
      const formats = byNotion.get(notionId) ?? new Set<BrickFormat>();
      formats.add(brick.type as BrickFormat);
      byNotion.set(notionId, formats);
    }
  }
  const bank: GlobalQuizBank[] = due
    .filter((row) => row.in_review)
    .map((row) => ({
      notionId: row.notion_id,
      formats: [...(byNotion.get(row.notion_id) ?? [])],
    }));
  const session = buildDailySession({
    formationId: formation.id,
    date: today,
    dueNotions: due
      .filter((row) => row.in_review)
      .map((row) => ({
        notionId: row.notion_id,
        moduleId: row.module_id,
        modulePosition: row.module_position,
        moduleStatus: row.module_status as 'locked' | 'open' | 'validated',
        evaluated: row.evaluated,
        dueAt: iso(row.due_at),
      })),
    // The home preview shows the daily count; gap formats are imposed by the real quiz (SPEC-701).
    gaps: [],
    bank,
    lastFormats: [],
    capMinutes: ENGINE.globalQuiz.maxMinutesDefault,
    mode: 'full',
    seed: `home:${formation.id}:${today}`,
    params: {
      notionCostSec: ENGINE.globalQuiz.notionCostSec,
      sessionOverheadSec: ENGINE.globalQuiz.sessionOverheadSec,
      formatSeconds: ENGINE.globalQuiz.formatSeconds,
      maintenanceMaxMinutes: ENGINE.globalQuiz.maintenanceMaxMinutes,
    },
  });
  const durationMin =
    session.estimatedMinutes === 0 ? 0 : Math.ceil(session.estimatedMinutes / 5) * 5;
  const deferredCount = Math.max(0, due.length - session.items.length);
  const nextReviewAt = profile.next_review_at;
  return {
    formationId: formation.id,
    formationTitle: formation.title,
    notionCount: session.items.length,
    gamesCount: new Set(session.items.map((item) => item.format)).size,
    durationMin,
    hasGaps: session.items.some((item) => item.gapNature !== null),
    deferred:
      deferredCount === 0
        ? null
        : {
            dueCount: due.length,
            deferredCount,
            deferredTo: addCivilDays(today, 1),
            dayLabel: deferredDayLabel(addCivilDays(today, 1), today, timeZone),
            capMin: ENGINE.globalQuiz.maxMinutesDefault,
          },
    nextReviewOn:
      session.items.length > 0 || nextReviewAt === null ? null : civilDayOf(nextReviewAt, timeZone),
  };
}

function ongoingRow(
  formation: FormationRow,
  next: SlotRow | undefined,
  now: Date,
  timeZone: string,
  currentFormationId: string | null,
  first: boolean,
): OngoingFormationRow {
  const status = formation.status as OngoingFormationRow['status'];
  const modulePosition = formation.open_module_position;
  const moduleCount = formation.module_count;
  const progressPercent =
    moduleCount === 0 ? 0 : Math.round((formation.validated_count / moduleCount) * 100);
  const action =
    status === 'active'
      ? {
          label: 'Reprendre',
          href: moduleHref(formation.id, formation.open_module_id),
        }
      : status === 'paused'
        ? { label: 'Reprendre', href: `/formations/${formation.id}/programme` }
        : status === 'programme_proposed'
          ? { label: 'Continuer', href: `/formations/${formation.id}/programme` }
          : { label: 'Continuer', href: `/formations/${formation.id}/cadrage` };
  const nextActivity =
    status === 'programme_proposed'
      ? {
          when: 'Valider le programme',
          detail:
            moduleCount === 1 ? '1 module proposé' : `${String(moduleCount)} modules proposés`,
        }
      : status === 'cadrage'
        ? {
            when: 'Terminer le cadrage',
            detail: `Question ${String(Math.min(5, formation.cadrage_questions + 1))} sur 5 au plus`,
          }
        : next === undefined
          ? null
          : {
              when: nextActivityLabel({ startsAt: iso(next.starts_at) }, now, timeZone),
              detail: nextActivityDetail({
                kind: next.kind,
                startsAt: iso(next.starts_at),
                meta: next.meta,
              }),
            };
  const moduleStatus =
    status === 'active'
      ? moduleStatusPill({
          contributionsInProgress: formation.contributions_in_progress,
          courseStatus: formation.course_status,
          readingPercent: formation.reading_percent,
          attemptCount: formation.attempt_count,
          lastScore: formation.last_score,
          threshold: formation.open_module_threshold ?? 80,
        })
      : null;
  const subtitle = objectiveText(formation.objectives);
  return {
    id: formation.id,
    monogram: formationMonogram(formation.title, formation.monogram),
    accent: formation.accent as OngoingFormationRow['accent'],
    status,
    title: formation.title,
    subtitle: subtitle === '' ? (formation.description ?? formation.title) : subtitle,
    progressPercent,
    modulePosition,
    moduleCount,
    moduleTitle: formation.open_module_title,
    moduleStatus,
    nextActivity,
    endDate: formation.end_date,
    action,
    primaryAction: first && formation.id === currentFormationId,
  };
}

function completedRow(
  formation: FormationRow,
  retention: RetentionValues,
  timeZone: string,
): CompletedFormationRow {
  const summary = completedSummary({
    startDate: formation.start_date,
    completedAt: formation.completed_at === null ? null : iso(formation.completed_at),
    volumeHours: formation.volume_hours,
    timeZone,
  });
  const description = formation.description?.trim() ?? '';
  const subtitle =
    description === ''
      ? objectiveText(formation.objectives) || formation.title
      : firstLineSummary(description);
  const revisionAction =
    formation.maintenance_mode === 'light'
      ? { label: 'Réviser', href: `/formations/${formation.id}/quiz-global` }
      : { label: 'Voir le bilan', href: `/formations/${formation.id}/bilan` };
  return {
    id: formation.id,
    monogram: formationMonogram(formation.title, formation.monogram),
    accent: formation.accent as CompletedFormationRow['accent'],
    status: 'completed',
    title: formation.title,
    subtitle,
    resultPercent: formation.result_percent,
    retentionPercent: retention.oneMonth,
    dueCount: formation.due_count,
    maintenanceMode: formation.maintenance_mode,
    completedOn: summary.completedOn,
    weeks: summary.weeks,
    volumeHours: summary.hours,
    action: revisionAction,
  };
}

async function readHome(tx: DbTx, userId: string, now: Date): Promise<HomeDto> {
  const profile = await readProfile(tx, userId, now);
  const timeZone = profile.timezone;
  const today = toUserZone(now, timeZone).date;
  const boundsStart = startOfUserDay(today, timeZone);
  const boundsEnd = endOfUserDay(today, timeZone);

  const [formations, slots, nextSlots, retentionRows, due, bricks] = await Promise.all([
    readFormations(tx, userId, now),
    readTodaySlots(tx, userId, boundsStart, boundsEnd),
    readNextSlots(tx, userId, now),
    readRetention(tx, userId),
    profile.current_formation_id === null
      ? Promise.resolve([])
      : readDueNotions(tx, userId, profile.current_formation_id, now),
    profile.current_formation_id === null
      ? Promise.resolve([])
      : readBricks(tx, userId, profile.current_formation_id),
  ]);

  const highlight = highlightedSlot(
    slots.map((row) => ({
      id: row.id,
      kind: row.kind,
      status: row.status,
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
    })),
    now,
  );
  const homeSlots: HomeSlot[] = slots.map((row) => {
    const state = slotState(
      {
        id: row.id,
        kind: row.kind,
        status: row.status,
        startsAt: iso(row.starts_at),
        endsAt: iso(row.ends_at),
      },
      now,
      highlight === undefined ? {} : { highlightId: highlight.id },
    );
    return {
      id: row.id,
      formationId: row.formation_id,
      kind: row.kind,
      title: row.title,
      meta: row.meta,
      time: toUserZone(iso(row.starts_at), timeZone).time,
      moduleId: row.module_id,
      activityId: row.activity_id,
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
      status: row.status,
      state,
      minutesUntil: state === 'next' ? minutesUntil({ startsAt: iso(row.starts_at) }, now) : null,
      href: slotHref({
        formationId: row.formation_id,
        moduleId: row.module_id,
        activityId: row.activity_id,
        kind: row.kind,
      }),
    };
  });

  const counted = slots.filter((row) => row.kind !== 'global_quiz');
  const plannedMinutes = counted.reduce(
    (total, row) =>
      total + (Date.parse(iso(row.ends_at)) - Date.parse(iso(row.starts_at))) / MS_PER_MINUTE,
    0,
  );
  const doneMinutes = counted
    .filter((row) => row.status === 'done')
    .reduce(
      (total, row) =>
        total + (Date.parse(iso(row.ends_at)) - Date.parse(iso(row.starts_at))) / MS_PER_MINUTE,
      0,
    );

  const highlightRow =
    highlight === undefined ? undefined : slots.find((row) => row.id === highlight.id);
  const primaryAction =
    highlightRow === undefined
      ? null
      : primaryActionFor({
          formationId: highlightRow.formation_id,
          moduleId: highlightRow.module_id,
          activityId: highlightRow.activity_id,
          kind: highlightRow.kind,
        });

  const nextByFormation = new Map(nextSlots.map((row) => [row.formation_id, row]));
  const currentId = profile.current_formation_id;
  const activeRows = formations.filter(
    (row) =>
      row.status === 'active' ||
      row.status === 'paused' ||
      row.status === 'programme_proposed' ||
      row.status === 'cadrage',
  );
  const rank = (row: FormationRow): number =>
    row.id === currentId
      ? -1
      : row.status === 'active'
        ? 0
        : row.status === 'paused'
          ? 1
          : row.status === 'programme_proposed'
            ? 2
            : 3;
  const ongoing = [...activeRows]
    .sort((left, right) => {
      const byRank = rank(left) - rank(right);
      if (byRank !== 0) return byRank;
      const leftOpened = left.last_opened_at === null ? 0 : Date.parse(iso(left.last_opened_at));
      const rightOpened = right.last_opened_at === null ? 0 : Date.parse(iso(right.last_opened_at));
      if (leftOpened !== rightOpened) return rightOpened - leftOpened;
      return left.created_at === right.created_at
        ? 0
        : Date.parse(iso(right.created_at)) - Date.parse(iso(left.created_at));
    })
    .map((row, index) =>
      ongoingRow(row, nextByFormation.get(row.id), now, timeZone, currentId, index === 0),
    );

  const completed = formations
    .filter((row) => row.status === 'completed')
    .sort((left, right) => {
      const leftDate = left.completed_at === null ? 0 : Date.parse(iso(left.completed_at));
      const rightDate = right.completed_at === null ? 0 : Date.parse(iso(right.completed_at));
      return rightDate - leftDate;
    })
    .map((row) =>
      completedRow(row, computeRetention(retentionRows, now, timeZone, row.id), timeZone),
    );

  const currentFormation = formations.find((row) => row.id === currentId);
  const quiz =
    currentFormation === undefined ||
    (currentFormation.status !== 'active' && currentFormation.status !== 'paused')
      ? null
      : globalQuiz(currentFormation, due, bricks, profile, today, now, timeZone);

  return {
    today: {
      date: today,
      label: civilDayLabel(today, timeZone),
      plannedMinutes: Math.round(plannedMinutes),
      doneMinutes: Math.round(doneMinutes),
      slots: homeSlots,
      primaryAction,
    },
    retention: computeRetention(retentionRows, now, timeZone),
    globalQuiz: quiz,
    formations: { ongoing, completed },
  };
}

/** GET /api/v1/home — one read of the learner's home screen (ET-1, ET-2). */
export function getHome(ctx: ServiceContext): Promise<Result<HomeDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const now = ctx.clock.now();
    return db.run((tx) => readHome(tx, userId, now));
  });
}
