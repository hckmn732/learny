// Mode pause et retour (SPEC-721, BR-AUT-10, ADR-0016, ADR-0190).
//
// The service owns the global account pause: it inserts the `pauses` row, freezes the future slots
// of every active formation and writes the `pause_started` / `pause_ended` journal entries. All
// writes run in the learner's RLS transaction; the domain event goes out after the commit. On
// return, a ten-minute diagnostic is selected with the deterministic draw of SPEC-406 and a real
// result — persisted through the daily activity of SPEC-411 — is required before the planner of
// SPEC-407 replans the resumed formations.
import { ENGINE, AUTOMATION_DEFAULTS, AUTOMATION_OPTIONS } from '@learny/config/product';
import type {
  PauseDiagnostic,
  PauseDiagnosticResultInput,
  PauseStartInput,
  PauseStateDto,
} from '@learny/contracts';
import { AppError, addCivilDays, userLocalDay, type Clock, type Result } from '@learny/core';
import { serviceDb, sql, upsertDailyActivity, type Db, type DbTx } from '@learny/db';
import { emitAfterCommit } from '@learny/jobs';
import {
  buildDailySession,
  type BrickFormat,
  type GlobalQuizDueNotion,
} from '@learny/learning-engine';

import { createAutomationActionQuiet } from '../automations';
import type { ServiceContext } from '../context';
import {
  cancelFutureSlots,
  fallbackCurrentFormation,
  lockFormationTransitions,
} from '../formations/state';
import { replanFormationAfterResume } from '../planning';
import { requireUser, toResult } from '../resources/result';

const MS_PER_DAY = 86_400_000;
const DIAGNOSTIC_MINUTES = 10;
const SUMMARY_MAX = 160;

interface PauseRow {
  id: string;
  starts_on: string;
  ends_on: string;
  diagnostic_on_return: boolean;
  status: 'active' | 'ended' | 'cancelled';
  ended_at: Date | string | null;
  created_at: Date | string;
  [key: string]: unknown;
}

interface ProfileRow {
  timezone: string;
  tutor_tone: string;
  [key: string]: unknown;
}

interface ActionRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  status: string;
  [key: string]: unknown;
}

interface PauseInternal {
  row: PauseRow | null;
  pausedFormationIds: string[];
  diagnostic: PauseDiagnostic | null;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function clip(value: string): string {
  return value.length <= SUMMARY_MAX ? value : `${value.slice(0, SUMMARY_MAX - 1).trimEnd()}…`;
}

function shiftDay(day: string, days: number): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + days));
  const pad = (value: number, width = 2) => String(value).padStart(width, '0');
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(
    shifted.getUTCDate(),
  )}`;
}

export function pauseSummary(
  kind: string,
  endDate: string,
  diagnosticEnabled: boolean,
  tone: 'tu' | 'vous',
): string {
  if (kind === 'pause_started') {
    return clip(
      tone === 'tu'
        ? `Pause déclarée jusqu’au ${endDate}. Ton planning est gelé et ta série reste intacte.`
        : `Pause déclarée jusqu’au ${endDate}. Votre planning est gelé et votre série reste intacte.`,
    );
  }
  return clip(
    diagnosticEnabled
      ? tone === 'tu'
        ? `Pause terminée : un diagnostic de 10 minutes sur les notions à risque précède la reprise.`
        : `Pause terminée : un diagnostic de 10 minutes sur les notions à risque précède la reprise.`
      : tone === 'tu'
        ? `Pause terminée : ton planning reprend dès aujourd’hui.`
        : `Pause terminée : votre planning reprend dès aujourd’hui.`,
  );
}

/** EF-1, CL-3 — a civil end date in the profile zone, never before the local day. */
export function validatePauseEndDate(
  endDate: string,
  localDay: string,
): { ok: true } | { ok: false; message: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return { ok: false, message: 'date civile AAAA-MM-JJ attendue' };
  }
  if (endDate < localDay) {
    return { ok: false, message: 'la fin de pause ne peut pas précéder aujourd’hui' };
  }
  return { ok: true };
}

/** EF-1 — the planning horizon of the pause, as an inclusive civil day. */
export function pauseEndDateInZone(now: Date, timeZone: string, calendarDays: number): string {
  const today = userLocalDay(now, timeZone);
  return addCivilDays(today, calendarDays);
}

async function readProfile(tx: DbTx, userId: string): Promise<ProfileRow> {
  const rows = await tx.execute<ProfileRow>(sql`
    select timezone, tutor_tone from public.profiles where id = ${userId}::uuid
  `);
  const row = rows[0];
  if (row === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
  return row;
}

function toneOf(profile: ProfileRow): 'tu' | 'vous' {
  return profile.tutor_tone === 'tu' ? 'tu' : 'vous';
}

async function readPauseRow(
  tx: DbTx,
  userId: string,
  opts: { forUpdate?: boolean } = {},
): Promise<PauseRow | null> {
  const lock = opts.forUpdate === true ? sql`for update` : sql``;
  const rows = await tx.execute<PauseRow>(sql`
    select id::text as id,
           starts_on::text as starts_on,
           ends_on::text as ends_on,
           diagnostic_on_return,
           status::text as status,
           ended_at,
           created_at
    from public.pauses
    where user_id = ${userId}::uuid
    order by created_at desc
    limit 1
    ${lock}
  `);
  return rows[0] ?? null;
}

async function readAction(
  tx: DbTx,
  userId: string,
  kind: 'pause_started' | 'pause_ended',
): Promise<ActionRow | null> {
  const rows = await tx.execute<ActionRow>(sql`
    select id::text as id, kind, payload, status::text as status
    from public.automation_actions
    where user_id = ${userId}::uuid
      and automation = 'pause'
      and kind = ${kind}
    order by created_at desc
    limit 1
  `);
  return rows[0] ?? null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function diagnosticOf(value: unknown): PauseDiagnostic | null {
  if (value === null || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.notionIds)) return null;
  const minutes = typeof record.minutes === 'number' ? record.minutes : DIAGNOSTIC_MINUTES;
  return {
    minutes,
    formationId: typeof record.formationId === 'string' ? record.formationId : null,
    notionIds: stringArray(record.notionIds),
    answered: typeof record.answered === 'number' ? record.answered : null,
    correct: typeof record.correct === 'number' ? record.correct : null,
    completedAt: typeof record.completedAt === 'string' ? record.completedAt : null,
  };
}

async function latestPauseActions(tx: DbTx, userId: string): Promise<PauseInternal> {
  const [row, started, ended] = await Promise.all([
    readPauseRow(tx, userId),
    readAction(tx, userId, 'pause_started'),
    readAction(tx, userId, 'pause_ended'),
  ]);
  const pausedFormationIds =
    started === null ? [] : stringArray(started.payload.pausedFormationIds);
  const diagnostic = ended === null ? null : diagnosticOf(ended.payload.diagnostic);
  return { row, pausedFormationIds, diagnostic };
}

function stateOf(internal: PauseInternal, localDay: string): PauseStateDto {
  const row = internal.row;
  if (row === null) {
    return {
      status: 'none',
      startsOn: null,
      endsOn: null,
      diagnosticOnReturn: true,
      endedAt: null,
      pausedFormationIds: [],
      returnDue: false,
      diagnostic: null,
    };
  }
  const ended = row.status !== 'active';
  return {
    status: ended ? 'ended' : 'active',
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    diagnosticOnReturn: row.diagnostic_on_return,
    endedAt: iso(row.ended_at),
    pausedFormationIds: internal.pausedFormationIds,
    returnDue: !ended && localDay > row.ends_on,
    diagnostic: internal.diagnostic,
  };
}

interface DiagnosticPlan {
  formationId: string | null;
  notionIds: string[];
  minutes: number;
}

interface RiskRow {
  notion_id: string;
  formation_id: string;
  module_id: string;
  module_position: number;
  module_status: string;
  due_at: Date | string;
  gap_nature: string | null;
  [key: string]: unknown;
}

interface BankRow {
  notion_id: string;
  type: string;
  [key: string]: unknown;
}

const FORMATS = new Set([
  'recall_card',
  'choice_question',
  'cloze',
  'ordering',
  'matching',
  'categorization',
  'open_question',
]);

/**
 * ET-4 — deterministic ten-minute diagnostic on the notions at risk with the draw of SPEC-406.
 * The seed freezes the selection for a pause and a learner, so a reload never changes it.
 */
async function buildDiagnosticPlan(
  tx: DbTx,
  userId: string,
  now: Date,
  timeZone: string,
  formationIds: readonly string[],
): Promise<DiagnosticPlan> {
  if (formationIds.length === 0) {
    return { formationId: null, notionIds: [], minutes: DIAGNOSTIC_MINUTES };
  }
  const rows = await tx.execute<RiskRow>(sql`
    select ns.notion_id::text as notion_id,
           n.formation_id::text as formation_id,
           n.module_id::text as module_id,
           m.position as module_position,
           coalesce(mp.status, m.status)::text as module_status,
           ns.due_at,
           ns.gap_nature::text as gap_nature
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    join public.modules m on m.id = n.module_id
    left join public.module_progress mp on mp.user_id = ns.user_id and mp.module_id = m.id
    where ns.user_id = ${userId}::uuid
      and n.formation_id in (${sql.join(
        formationIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
      and ns.in_review
      and not ns.suspended
      and (ns.gap_nature is not null or ns.due_at <= ${now.toISOString()}::timestamptz)
    order by m.position, ns.due_at, n.id
    limit 60
  `);
  if (rows.length === 0) {
    return { formationId: formationIds[0] ?? null, notionIds: [], minutes: DIAGNOSTIC_MINUTES };
  }
  const first = rows[0];
  if (first === undefined) {
    return { formationId: formationIds[0] ?? null, notionIds: [], minutes: DIAGNOSTIC_MINUTES };
  }
  const formationId = first.formation_id;
  const scoped = rows.filter((row) => row.formation_id === formationId);
  const notionIds = scoped.map((row) => row.notion_id);
  const bankRows = await tx.execute<BankRow>(sql`
    select distinct unnest(b.notion_ids)::text as notion_id, b.type::text as type
    from public.bricks b
    where b.notion_ids && array[${sql.join(
      notionIds.map((id) => sql`${id}::uuid`),
      sql`, `,
    )}]
  `);
  const formats = new Map<string, BrickFormat[]>();
  for (const row of bankRows) {
    if (!FORMATS.has(row.type)) continue;
    const current = formats.get(row.notion_id) ?? [];
    current.push(row.type as BrickFormat);
    formats.set(row.notion_id, current);
  }
  const dueNotions: GlobalQuizDueNotion[] = scoped.map((row) => ({
    notionId: row.notion_id,
    moduleId: row.module_id,
    modulePosition: row.module_position,
    moduleStatus:
      row.module_status === 'validated' || row.module_status === 'locked'
        ? row.module_status
        : 'open',
    evaluated: true,
    dueAt:
      row.due_at instanceof Date ? row.due_at.toISOString() : new Date(row.due_at).toISOString(),
  }));
  const gaps = scoped
    .filter((row) => row.gap_nature !== null)
    .map((row) => ({
      notionId: row.notion_id,
      nature: row.gap_nature as 'forgetting' | 'confusion' | 'misunderstanding' | 'application',
    }));
  const bank = notionIds.map((notionId) => ({
    notionId,
    formats: formats.get(notionId) ?? ['choice_question'],
  }));
  const session = buildDailySession({
    formationId,
    date: userLocalDay(now, timeZone),
    dueNotions,
    gaps,
    bank,
    lastFormats: [],
    capMinutes: DIAGNOSTIC_MINUTES,
    mode: 'micro',
    seed: `pause-diagnostic:${userId}:${formationId}`,
    params: {
      notionCostSec: ENGINE.globalQuiz.notionCostSec,
      sessionOverheadSec: ENGINE.globalQuiz.sessionOverheadSec,
      formatSeconds: ENGINE.globalQuiz.formatSeconds,
      maintenanceMaxMinutes: ENGINE.globalQuiz.maintenanceMaxMinutes,
    },
  });
  return {
    formationId,
    notionIds: session.items.map((item) => item.notionId),
    minutes: DIAGNOSTIC_MINUTES,
  };
}

async function pauseFormationsInTx(tx: DbTx, userId: string, now: Date): Promise<string[]> {
  await lockFormationTransitions(tx, userId);
  const rows = await tx.execute<{ id: string }>(sql`
    select id::text as id
    from public.formations
    where owner_id = ${userId}::uuid and status = 'active'
    order by coalesce(last_opened_at, created_at) desc, id
  `);
  const ids = rows.map((row) => row.id);
  for (const id of ids) {
    await tx.execute(sql`
      update public.formations
      set status = 'paused',
          paused_at = ${now.toISOString()}::timestamptz,
          updated_at = ${now.toISOString()}::timestamptz
      where id = ${id}::uuid and owner_id = ${userId}::uuid
    `);
    await cancelFutureSlots(tx, userId, id, now);
    await fallbackCurrentFormation(tx, userId, id);
  }
  return ids;
}

async function resumeFormationsInTx(
  tx: DbTx,
  userId: string,
  now: Date,
  clock: Clock,
  formationIds: readonly string[],
): Promise<string[]> {
  const resumed: string[] = [];
  for (const id of formationIds) {
    const rows = await tx.execute<{ status: string }>(sql`
      select status::text as status
      from public.formations
      where id = ${id}::uuid and owner_id = ${userId}::uuid
      for update
    `);
    const row = rows[0];
    if (row === undefined || row.status !== 'paused') continue;
    await tx.execute(sql`
      update public.formations
      set status = 'active',
          paused_at = null,
          updated_at = ${now.toISOString()}::timestamptz
      where id = ${id}::uuid and owner_id = ${userId}::uuid
    `);
    await replanFormationAfterResume(tx, userId, id, now, clock);
    resumed.push(id);
  }
  const first = resumed[0];
  if (first !== undefined) {
    await tx.execute(sql`
      update public.profiles
      set current_formation_id = ${first}::uuid
      where id = ${userId}::uuid and current_formation_id is null
    `);
  }
  return resumed;
}

/* ------------------------------------------------------------------ */
/* Public service                                                      */
/* ------------------------------------------------------------------ */

export function getPauseState(ctx: ServiceContext): Promise<Result<PauseStateDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const now = ctx.clock.now();
    const outcome = await db.run(async (tx) => {
      const profile = await readProfile(tx, userId);
      const localDay = userLocalDay(now, profile.timezone);
      const internal = await latestPauseActions(tx, userId);
      const state = stateOf(internal, localDay);
      if (state.status !== 'active' || !state.returnDue) {
        return {
          state,
          payload: null,
          createdAt: now,
          tone: toneOf(profile),
          resumed: [] as string[],
        };
      }
      // EF-2 — a read on the return day finalizes the pause exactly once (idempotent action).
      const ended = await endPauseInTx(tx, {
        userId,
        now,
        timeZone: profile.timezone,
        tone: toneOf(profile),
        clock: ctx.clock,
        force: false,
      });
      return {
        state: ended.state,
        payload: ended.payload,
        createdAt: now,
        tone: toneOf(profile),
        resumed: ended.resumedFormationIds,
      };
    });
    if (outcome.payload !== null) {
      const actionId = await recordPauseAction(ctx.sdb ?? serviceDb(), {
        userId,
        kind: 'pause_ended',
        summary: pauseSummary(
          'pause_ended',
          textOf(outcome.payload.endDate),
          outcome.state.diagnostic !== null,
          outcome.tone,
        ),
        payload: outcome.payload,
        createdAt: outcome.createdAt,
      });
      await emitAfterCommit(
        db,
        'automation/action-applied',
        { userId, actionId, automation: 'pause' },
        { id: `automation-action-applied:${actionId}` },
      );
      for (const formationId of outcome.resumed) {
        await emitAfterCommit(
          db,
          'formation/resumed',
          {
            userId,
            formationId,
            resumedOn: outcome.state.endedAt === null ? '' : (outcome.state.endsOn ?? ''),
          },
          { id: `formation-resumed:${formationId}:${outcome.state.endsOn ?? ''}` },
        );
      }
    }
    return outcome.state;
  });
}

export function startPause(
  ctx: ServiceContext,
  input: PauseStartInput,
): Promise<Result<PauseStateDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const now = ctx.clock.now();
    const outcome = await db.run(async (tx) => {
      const profile = await readProfile(tx, userId);
      const localDay = userLocalDay(now, profile.timezone);
      const valid = validatePauseEndDate(input.endDate, localDay);
      if (!valid.ok) {
        throw new AppError('VALIDATION_FAILED', `Date de fin invalide : ${valid.message}.`, {
          status: 422,
          errors: [{ path: 'endDate', message: valid.message }],
        });
      }
      await tx.execute(sql`
        select pg_advisory_xact_lock(hashtextextended('pause:' || ${userId}, 0))
      `);
      const active = await readPauseRow(tx, userId, { forUpdate: true });
      if (active !== null && active.status === 'active') {
        const same =
          active.ends_on === input.endDate &&
          active.diagnostic_on_return === input.diagnosticEnabled;
        if (!same) {
          throw new AppError(
            'CONFLICT',
            'Une pause est déjà active. Reprenez-la ou annulez-la avant d’en déclarer une autre.',
            { status: 409 },
          );
        }
        const internal = await latestPauseActions(tx, userId);
        return {
          state: stateOf(internal, localDay),
          payload: null,
          createdAt: now,
          tone: toneOf(profile),
        };
      }
      const inserted = await tx.execute<{ id: string }>(sql`
        insert into public.pauses (user_id, starts_on, ends_on, diagnostic_on_return, status)
        values (
          ${userId}::uuid,
          ${localDay}::date,
          ${input.endDate}::date,
          ${input.diagnosticEnabled},
          'active'
        )
        returning id::text as id
      `);
      const pauseId = inserted[0]?.id;
      if (pauseId === undefined) throw new AppError('INTERNAL_ERROR', 'Pause non écrite.');
      const pausedFormationIds = await pauseFormationsInTx(tx, userId, now);
      return {
        state: {
          status: 'active' as const,
          startsOn: localDay,
          endsOn: input.endDate,
          diagnosticOnReturn: input.diagnosticEnabled,
          endedAt: null,
          pausedFormationIds,
          returnDue: false,
          diagnostic: null,
        },
        payload: {
          dedupeKey: `pause:start:${pauseId}`,
          pauseId,
          endDate: input.endDate,
          startsOn: localDay,
          diagnosticEnabled: input.diagnosticEnabled,
          diagnosticMinutes: DIAGNOSTIC_MINUTES,
          pausedFormationIds,
          createdAt: now.toISOString(),
        },
        createdAt: now,
        tone: toneOf(profile),
      };
    });
    if (outcome.payload !== null) {
      const actionId = await recordPauseAction(ctx.sdb ?? serviceDb(), {
        userId,
        kind: 'pause_started',
        summary: pauseSummary(
          'pause_started',
          input.endDate,
          input.diagnosticEnabled,
          outcome.tone,
        ),
        payload: outcome.payload,
        createdAt: outcome.createdAt,
      });
      await emitAfterCommit(
        db,
        'automation/action-applied',
        { userId, actionId, automation: 'pause' },
        { id: `automation-action-applied:${actionId}` },
      );
    }
    return outcome.state;
  });
}

/** The journal row is created by the service role: the RLS policy reserves inserts to it. */
async function recordPauseAction(
  sdb: Db,
  input: {
    userId: string;
    kind: 'pause_started' | 'pause_ended';
    summary: string;
    payload: Record<string, unknown>;
    createdAt: Date;
  },
): Promise<string> {
  const created = await sdb.transaction((tx) =>
    createAutomationActionQuiet(tx, {
      userId: input.userId,
      formationId: null,
      automation: 'pause',
      kind: input.kind,
      summary: input.summary,
      payload: input.payload,
      undoPayload: null,
      requiresConsent: false,
      createdAt: input.createdAt,
    }),
  );
  const id = created.action?.id;
  if (id === undefined) throw new AppError('INTERNAL_ERROR', 'Action de pause non écrite.');
  return id;
}

interface EndPauseInput {
  userId: string;
  now: Date;
  timeZone: string;
  tone: 'tu' | 'vous';
  clock: Clock;
  force?: boolean;
}

interface EndPauseOutcome {
  state: PauseStateDto;
  actionId: string | null;
  resumedFormationIds: string[];
  diagnosticEnabled: boolean;
  localDay: string;
  pauseId: string | null;
  payload: Record<string, unknown> | null;
  tone: 'tu' | 'vous';
}

export async function endPauseInTx(tx: DbTx, input: EndPauseInput): Promise<EndPauseOutcome> {
  const localDay = userLocalDay(input.now, input.timeZone);
  const row = await readPauseRow(tx, input.userId, { forUpdate: true });
  if (row === null) {
    const internal = await latestPauseActions(tx, input.userId);
    return {
      state: stateOf(internal, localDay),
      actionId: null,
      resumedFormationIds: [],
      diagnosticEnabled: false,
      localDay,
      pauseId: null,
      payload: null,
      tone: input.tone,
    };
  }
  if (row.status !== 'active') {
    const internal = await latestPauseActions(tx, input.userId);
    return {
      state: stateOf(internal, localDay),
      actionId: null,
      resumedFormationIds: [],
      diagnosticEnabled: row.diagnostic_on_return,
      localDay,
      pauseId: null,
      payload: null,
      tone: input.tone,
    };
  }
  if (input.force === false && localDay <= row.ends_on) {
    const internal = await latestPauseActions(tx, input.userId);
    return {
      state: stateOf(internal, localDay),
      actionId: null,
      resumedFormationIds: [],
      diagnosticEnabled: row.diagnostic_on_return,
      localDay,
      pauseId: null,
      payload: null,
      tone: input.tone,
    };
  }
  await tx.execute(sql`
    update public.pauses
    set status = 'ended',
        ended_at = ${input.now.toISOString()}::timestamptz,
        updated_at = ${input.now.toISOString()}::timestamptz
    where id = ${row.id}::uuid and user_id = ${input.userId}::uuid
  `);
  const started = await readAction(tx, input.userId, 'pause_started');
  const pausedFormationIds =
    started === null ? [] : stringArray(started.payload.pausedFormationIds);
  const plan = row.diagnostic_on_return
    ? await buildDiagnosticPlan(tx, input.userId, input.now, input.timeZone, pausedFormationIds)
    : null;
  const hasDiagnostic = plan !== null && plan.notionIds.length > 0;
  const diagnostic: PauseDiagnostic | null = hasDiagnostic
    ? {
        minutes: plan.minutes,
        formationId: plan.formationId,
        notionIds: plan.notionIds,
        answered: null,
        correct: null,
        completedAt: null,
      }
    : null;
  const resumedFormationIds = hasDiagnostic
    ? []
    : await resumeFormationsInTx(tx, input.userId, input.now, input.clock, pausedFormationIds);
  const payload = {
    dedupeKey: `pause:end:${row.id}`,
    pauseId: row.id,
    endDate: row.ends_on,
    startsOn: row.starts_on,
    diagnosticEnabled: row.diagnostic_on_return,
    diagnosticMinutes: plan?.minutes ?? DIAGNOSTIC_MINUTES,
    pausedFormationIds,
    resumedFormationIds,
    diagnostic,
    createdAt: input.now.toISOString(),
  };
  return {
    state: {
      status: 'ended',
      startsOn: row.starts_on,
      endsOn: row.ends_on,
      diagnosticOnReturn: row.diagnostic_on_return,
      endedAt: input.now.toISOString(),
      pausedFormationIds,
      returnDue: false,
      diagnostic,
    },
    actionId: null,
    resumedFormationIds,
    diagnosticEnabled: hasDiagnostic,
    localDay,
    pauseId: row.id,
    payload,
    tone: input.tone,
  };
}

export function endPause(ctx: ServiceContext): Promise<Result<PauseStateDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const now = ctx.clock.now();
    const outcome = await db.run(async (tx) => {
      const profile = await readProfile(tx, userId);
      await tx.execute(sql`
        select pg_advisory_xact_lock(hashtextextended('pause:' || ${userId}, 0))
      `);
      return endPauseInTx(tx, {
        userId,
        now,
        timeZone: profile.timezone,
        tone: toneOf(profile),
        clock: ctx.clock,
      });
    });
    if (outcome.payload !== null) {
      const actionId = await recordPauseAction(ctx.sdb ?? serviceDb(), {
        userId,
        kind: 'pause_ended',
        summary: pauseSummary(
          'pause_ended',
          textOf(outcome.payload.endDate),
          outcome.diagnosticEnabled,
          outcome.tone,
        ),
        payload: outcome.payload,
        createdAt: now,
      });
      await emitAfterCommit(
        db,
        'automation/action-applied',
        { userId, actionId, automation: 'pause' },
        { id: `automation-action-applied:${actionId}` },
      );
    }
    for (const formationId of outcome.resumedFormationIds) {
      await emitAfterCommit(
        db,
        'formation/resumed',
        { userId, formationId, resumedOn: outcome.localDay },
        { id: `formation-resumed:${formationId}:${outcome.localDay}` },
      );
    }
    return outcome.state;
  });
}

/**
 * ET-4, CL-5 — the real result writes the daily activity of SPEC-411 before the replanification.
 * Without an answer (or before the diagnostic proposal) the pause stays waiting, never replans.
 */
export function completePauseDiagnostic(
  ctx: ServiceContext,
  input: PauseDiagnosticResultInput,
): Promise<Result<PauseStateDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const now = ctx.clock.now();
    const outcome = await db.run(async (tx) => {
      const profile = await readProfile(tx, userId);
      await tx.execute(sql`
        select pg_advisory_xact_lock(hashtextextended('pause:' || ${userId}, 0))
      `);
      const ended = await readAction(tx, userId, 'pause_ended');
      const diagnostic = ended === null ? null : diagnosticOf(ended.payload.diagnostic);
      if (ended === null || diagnostic === null) {
        throw new AppError('CONFLICT', 'Aucun diagnostic de retour en attente.', { status: 409 });
      }
      if (diagnostic.completedAt !== null) {
        const internal = await latestPauseActions(tx, userId);
        return {
          state: stateOf(internal, userLocalDay(now, profile.timezone)),
          resumed: [] as string[],
          actionId: ended.id,
          localDay: userLocalDay(now, profile.timezone),
        };
      }
      if (input.answered < 1) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Un diagnostic sans réponse ne déclenche pas la replanification.',
          {
            status: 422,
            errors: [{ path: 'answered', message: 'au moins une réponse attendue' }],
          },
        );
      }
      await upsertDailyActivity(tx, {
        userId,
        day: userLocalDay(now, profile.timezone),
        minutes: diagnostic.minutes,
        qualifying: true,
        sources: [`pause-diagnostic:${ended.id}`],
      });
      const completed: PauseDiagnostic = {
        ...diagnostic,
        answered: input.answered,
        correct: input.correct,
        completedAt: now.toISOString(),
      };
      const payload = {
        ...ended.payload,
        diagnostic: completed,
      };
      await tx.execute(sql`
        update public.automation_actions
        set payload = ${JSON.stringify(payload)}::jsonb,
            summary = ${pauseSummary('pause_ended', textOf(ended.payload.endDate), false, toneOf(profile))}
        where id = ${ended.id}::uuid and user_id = ${userId}::uuid
      `);
      const pausedFormationIds = stringArray(ended.payload.pausedFormationIds);
      const resumed = await resumeFormationsInTx(tx, userId, now, ctx.clock, pausedFormationIds);
      const internal = await latestPauseActions(tx, userId);
      return {
        state: stateOf(internal, userLocalDay(now, profile.timezone)),
        resumed,
        actionId: ended.id,
        localDay: userLocalDay(now, profile.timezone),
      };
    });
    for (const formationId of outcome.resumed) {
      await emitAfterCommit(
        db,
        'formation/resumed',
        { userId, formationId, resumedOn: outcome.localDay },
        { id: `formation-resumed:${formationId}:${outcome.localDay}` },
      );
    }
    return outcome.state;
  });
}

/** ET-3 — the effect applied by the engine definition, in the engine transaction. */
export async function applyPauseAutomationInTx(
  tx: DbTx,
  input: {
    userId: string;
    kind: string;
    now: Date;
    timeZone: string;
    tone: 'tu' | 'vous';
    clock: Clock;
    payload: Record<string, unknown>;
  },
): Promise<{ resumedFormationIds: string[]; diagnostic: PauseDiagnostic | null }> {
  if (input.kind === 'pause_started') return { resumedFormationIds: [], diagnostic: null };
  const outcome = await endPauseInTx(tx, {
    userId: input.userId,
    now: input.now,
    timeZone: input.timeZone,
    tone: input.tone,
    clock: input.clock,
  });
  return {
    resumedFormationIds: outcome.resumedFormationIds,
    diagnostic: outcome.diagnosticEnabled
      ? diagnosticOf((await readAction(tx, input.userId, 'pause_ended'))?.payload.diagnostic)
      : null,
  };
}

export const PAUSE_OPTIONS = {
  diagnosticMinutes: AUTOMATION_OPTIONS.pause.diagnosticMinutes,
  diagnosticOnReturn: AUTOMATION_DEFAULTS.pause.diagnosticOnReturn,
  shiftDays: [3, 7, 14] as const,
  msPerDay: MS_PER_DAY,
  shiftDay,
};
