// « Micro-séance de secours » (SPEC-713, BR-AUT-02, ADR-0190, ADR-0192 §1).
//
// At `hour` local, when the learner has not studied yet today, automation 2 proposes a short
// session of `durationMin` minutes: one five-minute `micro_session` slot, a `global_quiz_today`
// notification pointing at `/formations/<fid>/quiz-global?mode=micro`, and a journal action. Doing
// the session consumes the action and keeps the streak (BR-GAM-01); an action not done at the end
// of the local day expires and its slot becomes `missed` (never replaced, ADR-0192 §1).
import { z } from 'zod';

import { ENGINE } from '@learny/config/product';
import { MicroSeanceParams } from '@learny/contracts';
import {
  AppError,
  endOfUserDay,
  localTimeToInstant,
  ok,
  userDayBounds,
  userLocalDay,
  type Result,
} from '@learny/core';
import { sql, type Db, type DbTx } from '@learny/db';
import {
  buildDailySession,
  type BrickFormat,
  type GlobalQuizBank,
  type GlobalQuizDueNotion,
  type GlobalQuizGap,
} from '@learny/learning-engine';

import {
  shouldProposeMicroSession,
  type MicroFormationCandidate,
} from '../micro-seance/should-propose';
import {
  defineAutomation,
  type AutomationActionDraft,
  type AutomationActionView,
  type AutomationDefinition,
  type AutomationDomainContext,
  type AutomationEffectContext,
  type AutomationTone,
} from '../moteur-d-automatismes';
import { formatDayInSentence } from '../reprise';

const SUMMARY_MAX = 160;
const SLOT_TITLE = 'Micro-séance de secours';
const QUIZ_FORMATS = new Set<string>([
  'choice_question',
  'open_question',
  'cloze',
  'matching',
  'ordering',
  'categorization',
  'recall_card',
]);

interface ProfileRow extends Record<string, unknown> {
  timezone: string;
  tutor_tone: string;
  current_formation_id: string | null;
  study_days: number[] | string[] | null;
}

interface FormationRow extends Record<string, unknown> {
  id: string;
  title: string;
  last_opened_at: Date | string | null;
}

interface DueRow extends Record<string, unknown> {
  notion_id: string;
  formation_id: string;
  module_id: string;
  module_position: number;
  module_status: string;
  evaluated: boolean;
  due_at: Date | string;
  gap_nature: string | null;
}

interface BrickRow extends Record<string, unknown> {
  formation_id: string;
  type: string;
  notion_ids: string[];
}

interface ActionRow extends Record<string, unknown> {
  id: string;
  payload: Record<string, unknown>;
  undo_payload: Record<string, unknown> | null;
}

function clip(value: string): string {
  return value.length <= SUMMARY_MAX ? value : `${value.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
}

function stringOf(value: unknown, fallback = ''): string {
  return typeof value === 'string' && value !== '' ? value : fallback;
}

function numberOr(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function dbInstant(value: Date | string | null): Date | null {
  if (value === null) return null;
  return value instanceof Date ? value : new Date(value);
}

function possession(tone: AutomationTone): string {
  return tone === 'tu' ? 'ta' : 'votre';
}

function durationOf(payload: Record<string, unknown>): number {
  return numberOr(payload.durationMin, 5);
}

function hourOf(payload: Record<string, unknown>): number {
  return numberOr(payload.hour, 20);
}

function dayLabel(day: string, timeZone: string): string {
  return formatDayInSentence(day, `${day}T12:00:00Z`, timeZone);
}

/** EF-8 — the four statuses of the journal, in both tones. */
export function explainMicroSeance(
  action: AutomationActionView,
  tone: AutomationTone,
  timeZone: string,
): string {
  const duration = durationOf(action.payload);
  const hour = hourOf(action.payload);
  const day = stringOf(action.payload.date, action.createdAt.slice(0, 10));
  switch (action.status) {
    case 'consumed':
      return clip(`Micro-séance de ${String(duration)} min proposée et faite : série conservée.`);
    case 'expired':
      return clip(
        `Micro-séance de ${String(duration)} min proposée à ${String(hour)}:00, non faite.`,
      );
    case 'undone':
      return clip(
        `Annulé : micro-séance de ${String(duration)} min du ${dayLabel(day, timeZone)}.`,
      );
    case 'declined':
      return clip(
        `Refusé : micro-séance de ${String(duration)} min proposée à ${String(hour)}:00.`,
      );
    default:
      return clip(
        `Micro-séance de ${String(duration)} min proposée à ${String(hour)}:00 pour garder ${possession(tone)} série.`,
      );
  }
}

/**
 * EF-8 (SPEC-722) — the consumed line of the home card, stored in the payload because the card
 * projects the journal without loading the definition (services may not import automations).
 */
export function microCardSummary(
  day: string,
  hour: number,
  duration: number,
  tone: AutomationTone,
  timeZone: string,
): string {
  const label = dayLabel(day, timeZone);
  const capitalized = label.charAt(0).toUpperCase() + label.slice(1);
  return clip(
    `${capitalized} ${String(hour)}:00, micro-séance de ${String(duration)} min faite : ${possession(tone)} série est conservée.`,
  );
}

/** EF-8 (SPEC-710) — the « dernière action » line, stored with the action. */
export function microLastActionSummary(
  day: string,
  hour: number,
  duration: number,
  timeZone: string,
): string {
  return clip(
    `${dayLabel(day, timeZone)} ${String(hour)}:00, micro-séance de ${String(duration)} min faite : série conservée.`,
  );
}

function notificationBody(duration: number, tone: AutomationTone): string {
  return tone === 'tu'
    ? `Pas eu le temps aujourd’hui ? ${String(duration)} minutes de cartes de rappel suffisent pour garder ta série.`
    : `Pas eu le temps aujourd’hui ? ${String(duration)} minutes de cartes de rappel suffisent pour garder votre série.`;
}

/* ------------------------------------------------------------------ */
/* Reads                                                               */
/* ------------------------------------------------------------------ */

async function readProfile(db: Db | DbTx, userId: string): Promise<ProfileRow> {
  const rows = await db.execute<ProfileRow>(sql`
    select p.timezone,
           p.tutor_tone::text as tutor_tone,
           p.current_formation_id::text as current_formation_id,
           sp.study_days
    from public.profiles p
    left join public.study_preferences sp on sp.user_id = p.id
    where p.id = ${userId}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  return row;
}

async function readFormations(db: Db | DbTx, userId: string): Promise<FormationRow[]> {
  return db.execute<FormationRow>(sql`
    select id::text as id, title, last_opened_at
    from public.formations
    where owner_id = ${userId}::uuid
      and (
        status = 'active'
        or (status = 'completed' and maintenance_mode = 'light')
      )
    order by coalesce(last_opened_at, 'epoch'::timestamptz) desc, created_at asc
  `);
}

async function readDueRows(
  db: Db | DbTx,
  userId: string,
  formationIds: readonly string[],
  now: Date,
): Promise<DueRow[]> {
  if (formationIds.length === 0) return [];
  return db.execute<DueRow>(sql`
    select ns.notion_id::text as notion_id,
           n.formation_id::text as formation_id,
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
                 and act.formation_id = n.formation_id
                 and a.status in ('graded', 'timed_out')
             )
           ) as evaluated,
           ns.due_at,
           ns.gap_nature::text as gap_nature
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    join public.modules m on m.id = n.module_id
    left join public.module_progress mp
      on mp.user_id = ns.user_id and mp.module_id = m.id
    where ns.user_id = ${userId}::uuid
      and n.formation_id = any(
        array(select jsonb_array_elements_text(${JSON.stringify(formationIds)}::jsonb)::uuid)
      )
      and ns.in_review
      and not ns.suspended
      and ns.due_at <= ${now.toISOString()}::timestamptz
    order by m.position, ns.due_at, n.position, n.id
  `);
}

async function readBricks(
  db: Db | DbTx,
  userId: string,
  formationIds: readonly string[],
): Promise<BrickRow[]> {
  if (formationIds.length === 0) return [];
  return db.execute<BrickRow>(sql`
    select b.formation_id::text as formation_id,
           b.type::text as type,
           b.notion_ids::text[] as notion_ids
    from public.bricks b
    where b.owner_id = ${userId}::uuid
      and b.formation_id = any(
        array(select jsonb_array_elements_text(${JSON.stringify(formationIds)}::jsonb)::uuid)
      )
      and b.status = 'active'
  `);
}

function isModuleStatus(value: string): value is 'locked' | 'open' | 'validated' {
  return value === 'locked' || value === 'open' || value === 'validated';
}

/** EF-2 (3), ET-6 — read-only draw of the micro-session of each active formation. */
function microSizes(
  userId: string,
  today: string,
  durationMin: number,
  formations: readonly FormationRow[],
  due: readonly DueRow[],
  bricks: readonly BrickRow[],
): MicroFormationCandidate[] {
  const byFormation = new Map<string, DueRow[]>();
  for (const row of due) {
    const list = byFormation.get(row.formation_id) ?? [];
    list.push(row);
    byFormation.set(row.formation_id, list);
  }
  const formatsByNotion = new Map<string, Set<BrickFormat>>();
  for (const brick of bricks) {
    if (!QUIZ_FORMATS.has(brick.type)) continue;
    for (const notionId of brick.notion_ids) {
      const formats = formatsByNotion.get(notionId) ?? new Set<BrickFormat>();
      formats.add(brick.type as BrickFormat);
      formatsByNotion.set(notionId, formats);
    }
  }

  return formations.map((formation) => {
    const rows = (byFormation.get(formation.id) ?? []).filter((row) =>
      isModuleStatus(row.module_status),
    );
    const dueNotions: GlobalQuizDueNotion[] = rows.map((row) => ({
      notionId: row.notion_id,
      moduleId: row.module_id,
      modulePosition: row.module_position,
      moduleStatus: row.module_status as 'locked' | 'open' | 'validated',
      evaluated: row.evaluated,
      dueAt: new Date(row.due_at).toISOString(),
    }));
    const gaps: GlobalQuizGap[] = [];
    for (const row of rows) {
      if (row.gap_nature === null) continue;
      if (
        row.gap_nature === 'forgetting' ||
        row.gap_nature === 'confusion' ||
        row.gap_nature === 'misunderstanding' ||
        row.gap_nature === 'application'
      ) {
        gaps.push({ notionId: row.notion_id, nature: row.gap_nature });
      }
    }
    const bank: GlobalQuizBank[] = rows.map((row) => ({
      notionId: row.notion_id,
      formats: [...(formatsByNotion.get(row.notion_id) ?? [])],
    }));
    const drawn = buildDailySession({
      formationId: formation.id,
      date: today,
      dueNotions,
      gaps,
      bank,
      lastFormats: [],
      capMinutes: durationMin,
      mode: 'micro',
      seed: `micro:${userId}:${formation.id}:${today}`,
      params: {
        notionCostSec: ENGINE.globalQuiz.notionCostSec,
        sessionOverheadSec: ENGINE.globalQuiz.sessionOverheadSec,
        formatSeconds: ENGINE.globalQuiz.formatSeconds,
        maintenanceMaxMinutes: ENGINE.globalQuiz.maintenanceMaxMinutes,
      },
    });
    const last = dbInstant(formation.last_opened_at);
    return {
      formationId: formation.id,
      lastOpenedAt: last === null ? null : last.toISOString(),
      microItemCount: drawn.items.length,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Proposal (EF-2 to EF-4, CA-1, CA-2)                                 */
/* ------------------------------------------------------------------ */

async function proposalDrafts(
  ctx: AutomationDomainContext<z.output<typeof MicroSeanceParams>>,
): Promise<AutomationActionDraft[]> {
  const db = ctx.db;
  const profile = await readProfile(db, ctx.userId);
  const today = userLocalDay(ctx.now, profile.timezone);
  const bounds = userDayBounds(today, profile.timezone);

  const activity = await db.execute<{ qualifying: boolean }>(sql`
    select qualifying
    from public.daily_activity
    where user_id = ${ctx.userId}::uuid and day = ${today}::date
  `);
  const slots = await db.execute<{ status: string }>(sql`
    select status::text as status
    from public.schedule_slots
    where user_id = ${ctx.userId}::uuid
      and starts_at >= ${bounds.start.toISOString()}::timestamptz
      and starts_at < ${bounds.end.toISOString()}::timestamptz
  `);

  const formations = await readFormations(db, ctx.userId);
  const formationIds = formations.map((formation) => formation.id);
  const due = await readDueRows(db, ctx.userId, formationIds, ctx.now);
  const bricks = await readBricks(db, ctx.userId, formationIds);
  const candidates = microSizes(ctx.userId, today, ctx.params.durationMin, formations, due, bricks);
  const decision = shouldProposeMicroSession({
    today,
    studyDays: (profile.study_days ?? [1, 2, 3, 4, 5]).map((day) => Number(day)),
    dailyActivity: activity[0] === undefined ? null : { qualifying: activity[0].qualifying },
    slotsToday: slots,
    currentFormationId: profile.current_formation_id,
    candidates,
  });
  if (!decision.propose || decision.formationId === null) return [];

  const formation = formations.find((row) => row.id === decision.formationId);
  if (formation === undefined) return [];
  const duration = ctx.params.durationMin;
  const hour = ctx.params.hour;
  const date = today;
  const dedupeKey = `micro:${date}`;
  const expiresAt = endOfUserDay(date, profile.timezone);
  const payload: Record<string, unknown> = {
    dedupeKey,
    date,
    hour,
    durationMin: duration,
    notionCount: decision.notionCount,
    formationId: formation.id,
    formationTitle: formation.title,
    summaryConsumed: `Micro-séance de ${String(duration)} min proposée et faite : série conservée.`,
    summaryExpired: `Micro-séance de ${String(duration)} min proposée à ${String(hour)}:00, non faite.`,
    cardSummary: microCardSummary(date, hour, duration, ctx.tone, profile.timezone),
    lastActionSummary: microLastActionSummary(date, hour, duration, profile.timezone),
  };
  return [
    {
      kind: 'micro_session_proposed',
      formationId: formation.id,
      requiresConsent: false,
      payload,
      dedupeKey,
      expiresAt: expiresAt.toISOString(),
      notification: {
        type: 'global_quiz_today',
        href: `/formations/${encodeURIComponent(formation.id)}/quiz-global?mode=micro`,
        expiresAt: expiresAt.toISOString(),
        data: {
          titleOverride: SLOT_TITLE,
          bodyOverride: notificationBody(duration, ctx.tone),
        },
      },
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Expiry (EF-7, CA-5, ADR-0192 §1)                                    */
/* ------------------------------------------------------------------ */

async function expireOverdue(
  ctx: AutomationDomainContext<z.output<typeof MicroSeanceParams>>,
): Promise<AutomationActionDraft[]> {
  const rows = await ctx.db.execute<ActionRow>(sql`
    select id::text as id, payload, undo_payload
    from public.automation_actions
    where user_id = ${ctx.userId}::uuid
      and automation = 'micro_seance'
      and status = 'applied'
      and payload ? 'expiresAt'
      and (payload ->> 'expiresAt')::timestamptz <= ${ctx.now.toISOString()}::timestamptz
  `);
  if (rows.length === 0) return [];
  await ctx.db.transaction(async (tx) => {
    for (const row of rows) {
      const summary = clip(
        stringOf(
          row.payload.summaryExpired,
          `Micro-séance non faite le ${stringOf(row.payload.date, '')}.`,
        ),
      );
      await tx.execute(sql`
        update public.automation_actions
        set status = 'expired', summary = ${summary}, decided_at = ${ctx.now.toISOString()}::timestamptz
        where id = ${row.id}::uuid and user_id = ${ctx.userId}::uuid and status = 'applied'
      `);
      const undo = row.undo_payload ?? {};
      const slotId = stringOf(undo.slotId);
      if (slotId === '') continue;
      await tx.execute(sql`
        update public.schedule_slots
        set status = 'missed', updated_at = ${ctx.now.toISOString()}::timestamptz
        where id = ${slotId}::uuid and user_id = ${ctx.userId}::uuid and status = 'planned'
      `);
    }
  });
  return [];
}

/* ------------------------------------------------------------------ */
/* Effects (EF-3, EF-6, EF-9)                                          */
/* ------------------------------------------------------------------ */

async function insertSlot(
  tx: DbTx,
  userId: string,
  input: {
    formationId: string;
    date: string;
    hour: number;
    durationMin: number;
    timeZone: string;
  },
): Promise<string> {
  const startsAt = localTimeToInstant(input.date, `${String(input.hour)}:00`, input.timeZone);
  const endsAt = new Date(startsAt.getTime() + input.durationMin * 60_000);
  const rows = await tx.execute<{ id: string }>(sql`
    insert into public.schedule_slots (
      user_id, formation_id, kind, title, meta, starts_at, ends_at, status, created_by
    ) values (
      ${userId}::uuid, ${input.formationId}::uuid, 'micro_session', ${SLOT_TITLE},
      ${`${String(input.durationMin)} min · ajoutée par le tuteur`},
      ${startsAt.toISOString()}::timestamptz, ${endsAt.toISOString()}::timestamptz,
      'planned', 'automation'
    )
    returning id::text as id
  `);
  const id = rows[0]?.id;
  if (id === undefined) throw new AppError('INTERNAL_ERROR', 'Créneau de micro-séance non créé.');
  return id;
}

async function applyMicroSeance(
  ctx: AutomationEffectContext,
  action: AutomationActionView,
): Promise<Result<{ payload: Record<string, unknown>; undoPayload: Record<string, unknown> }>> {
  const formationId = stringOf(action.payload.formationId, action.formationId ?? '');
  const date = stringOf(action.payload.date);
  if (formationId === '' || date === '') {
    throw new AppError('VALIDATION_FAILED', 'Micro-séance incomplète.');
  }
  const slotId = await insertSlot(ctx.tx, ctx.userId, {
    formationId,
    date,
    hour: hourOf(action.payload),
    durationMin: durationOf(action.payload),
    timeZone: ctx.timeZone,
  });
  return ok({
    payload: { ...action.payload, formationId, slotId, appliedAt: ctx.now.toISOString() },
    undoPayload: { slotId },
  });
}

async function undoMicroSeance(
  ctx: AutomationEffectContext,
  action: AutomationActionView,
): Promise<Result<Record<string, unknown> | null>> {
  const undo = action.undoPayload ?? {};
  const slotId = stringOf(undo.slotId);
  if (slotId !== '') {
    await ctx.tx.execute(sql`
      update public.schedule_slots
      set status = 'cancelled', updated_at = ${ctx.now.toISOString()}::timestamptz
      where id = ${slotId}::uuid and user_id = ${ctx.userId}::uuid and status = 'planned'
    `);
  }
  // EF-9 — the proposal leaves the in-app inbox as soon as it is cancelled.
  await ctx.tx.execute(sql`
    update public.notifications
    set read_at = ${ctx.now.toISOString()}::timestamptz
    where user_id = ${ctx.userId}::uuid
      and dedupe_key = ${`automation:${action.id}`}
      and read_at is null
  `);
  return ok(null);
}

/* ------------------------------------------------------------------ */
/* Definition                                                          */
/* ------------------------------------------------------------------ */

export const microSeanceAutomation: AutomationDefinition<typeof MicroSeanceParams> =
  defineAutomation({
    key: 'micro_seance',
    triggers: [
      { type: 'hourly', localHour: (params) => Number(params.hour ?? 20) },
      // EF-7 — the midnight tick expires the micro-session of the previous local day.
      { type: 'hourly', localHour: 0 },
      { type: 'direct' },
    ],
    params: MicroSeanceParams,
    run: async (ctx, trigger) => {
      if (trigger.type === 'direct') return proposalDrafts(ctx);
      if (trigger.type !== 'hourly') return [];
      const hour =
        typeof trigger.localHour === 'function' ? trigger.localHour(ctx.params) : trigger.localHour;
      if (hour === 0) return expireOverdue(ctx);
      if (hour === ctx.params.hour) return proposalDrafts(ctx);
      return [];
    },
    explain: explainMicroSeance,
    apply: applyMicroSeance,
    undo: undoMicroSeance,
  });

/** ET-6 — the daily expiry never shifts a micro-session: no replacement is planned. */
export const MICRO_SEANCE_NEVER_REPLACED = true;
