// Sidebar service of the application shell (SPEC-304 EF-1 to EF-5, ET-1 to ET-5; BR-NAV-02,
// BR-NAV-03, BR-PRO-04, BR-FOR-11, ADR-0075, ADR-0162).
//
// Everything is read with the learner's own RLS client (`ctx.db`): another learner's formations,
// module progress, counters or streak never reach the DTO. The current formation is the active one
// stored in `profiles.current_formation_id`; when it is missing, paused or inaccessible, the most
// recently opened active formation is used, then the first active one. Paused formations stay in
// the switcher but are never rendered as the current formation (ET-1).
import {
  SidebarUpdateInput,
  type SidebarDto,
  type SidebarFormation,
  type StreakDay,
} from '@learny/contracts';
import { AppError, toUserZone, type Clock, type Result } from '@learny/core';
import { sql, type DbTx } from '@learny/db';

import type { ServiceContext } from './context';
import { requireUser, toResult } from './resources/result';

/** Number of regularity boxes of the sidebar (BR-GAM-02). */
export const STREAK_REGULARITY_DAYS = 14;

/** Stable visual accent until SPEC-603 adds `formations.accent_color` (ADR-0162). */
const DEFAULT_ACCENT = 'indigo' as const;

interface ProfileRow {
  current_formation_id: string | null;
  sidebar_collapsed: boolean;
  timezone: string;
  streak_days: number;
  [key: string]: unknown;
}

interface FormationRow {
  id: string;
  title: string;
  status: 'active' | 'paused';
  module_count: number;
  validated_count: number;
  open_position: number | null;
  [key: string]: unknown;
}

interface CounterRow {
  due_count: number;
  gap_count: number;
  [key: string]: unknown;
}

interface ActivityRow {
  day: string;
  minutes: number;
  qualifying: boolean;
  [key: string]: unknown;
}

interface IdRow {
  id: string;
  [key: string]: unknown;
}

/** ADR-0162 fallback: two first alphanumeric characters, without accents, in capitals. */
export function formationMonogram(title: string): string {
  const folded = title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return folded.slice(0, 2) === '' ? '?' : folded.slice(0, 2);
}

/** Civil day shifted by `delta` days without going through the process time zone. */
export function shiftCivilDay(day: string, delta: number): string {
  const [year = 0, month = 1, date = 1] = day.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, date + delta));
  const pad = (value: number, length = 2) => String(value).padStart(length, '0');
  return `${pad(shifted.getUTCFullYear(), 4)}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`;
}

/** The `count` civil days ending at `today`, oldest first (BR-GAM-02). */
export function lastCivilDays(today: string, count = STREAK_REGULARITY_DAYS): string[] {
  return Array.from({ length: count }, (_value, index) => shiftCivilDay(today, index - count + 1));
}

function toFormation(row: FormationRow): SidebarFormation {
  const progressPercent =
    row.module_count === 0 ? 0 : Math.round((row.validated_count / row.module_count) * 100);
  return {
    id: row.id,
    title: row.title,
    monogram: formationMonogram(row.title),
    accent: DEFAULT_ACCENT,
    status: row.status,
    progressPercent,
    currentModulePosition: row.open_position,
    moduleCount: row.module_count,
  };
}

async function readProfile(tx: DbTx, userId: string): Promise<ProfileRow> {
  const rows = await tx.execute<ProfileRow>(sql`
    select current_formation_id::text as current_formation_id,
           sidebar_collapsed,
           timezone,
           streak_days
    from public.profiles
    where id = ${userId}::uuid
  `);
  const profile = rows[0];
  if (profile === undefined) {
    throw new AppError('NOT_FOUND', 'Profil introuvable.');
  }
  return profile;
}

async function readFormations(tx: DbTx, userId: string): Promise<SidebarFormation[]> {
  const rows = await tx.execute<FormationRow>(sql`
    select f.id::text as id,
           f.title,
           f.status::text as status,
           count(m.id)::int as module_count,
           count(m.id) filter (where m.status = 'validated')::int as validated_count,
           max(m.position) filter (where m.status = 'open')::int as open_position
    from public.formations f
    left join public.modules m on m.formation_id = f.id
    where f.owner_id = ${userId}::uuid
      and f.status in ('active', 'paused')
    group by f.id, f.title, f.status, f.last_opened_at, f.created_at
    order by f.last_opened_at desc nulls last, f.created_at desc
  `);
  return rows.map(toFormation);
}

async function readCounters(
  tx: DbTx,
  userId: string,
  formationId: string | null,
  now: Date,
): Promise<CounterRow> {
  if (formationId === null) return { due_count: 0, gap_count: 0 };
  const rows = await tx.execute<CounterRow>(sql`
    select count(*) filter (
             where ns.in_review and ns.due_at is not null and ns.due_at <= ${now.toISOString()}::timestamptz
           )::int as due_count,
           count(*) filter (
             where ns.gap_nature is not null and ns.gap_cleared_at is null
           )::int as gap_count
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    where ns.user_id = ${userId}::uuid
      and n.formation_id = ${formationId}::uuid
  `);
  return rows[0] ?? { due_count: 0, gap_count: 0 };
}

async function readStreak(
  tx: DbTx,
  userId: string,
  profile: ProfileRow,
  clock: Clock,
): Promise<SidebarDto['streak']> {
  const today = toUserZone(clock.now(), profile.timezone).date;
  const days = lastCivilDays(today);
  const first = days[0] ?? today;
  const rows = await tx.execute<ActivityRow>(sql`
    select day::text as day, minutes, qualifying
    from public.daily_activity
    where user_id = ${userId}::uuid
      and day between ${first}::date and ${today}::date
  `);
  const activity = new Map(rows.map((row) => [row.day, row]));
  const regularity: StreakDay[] = days.map((date) => {
    const entry = activity.get(date);
    return {
      date,
      status: entry !== undefined && (entry.qualifying || entry.minutes > 0) ? 'done' : 'none',
    };
  });
  return { days: Math.max(0, profile.streak_days), regularity };
}

async function readSidebar(tx: DbTx, userId: string, clock: Clock): Promise<SidebarDto> {
  const profile = await readProfile(tx, userId);
  const formations = await readFormations(tx, userId);
  const active = formations.filter((formation) => formation.status === 'active');
  const currentFormation =
    active.find((formation) => formation.id === profile.current_formation_id) ?? active[0] ?? null;
  const counters = await readCounters(tx, userId, currentFormation?.id ?? null, clock.now());
  const streak = await readStreak(tx, userId, profile, clock);
  return {
    collapsed: profile.sidebar_collapsed,
    currentFormation,
    formations,
    quizDueCount: counters.due_count,
    gapCount: counters.gap_count,
    streak,
  };
}

/** GET /api/v1/me/sidebar — menu data of the authenticated learner (ET-1, ET-3). */
export function getSidebar(ctx: ServiceContext): Promise<Result<SidebarDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run((tx) => readSidebar(tx, userId, ctx.clock));
  });
}

function parseUpdate(input: unknown): SidebarUpdateInput {
  const parsed = SidebarUpdateInput.safeParse(input);
  if (parsed.success) return parsed.data;
  throw new AppError('VALIDATION_FAILED', 'Les données envoyées sont invalides.', {
    errors: parsed.error.issues.map((issue) => ({
      path: ['body', ...issue.path.map(String)].join('.'),
      message: issue.message,
    })),
  });
}

/**
 * PATCH /api/v1/me/sidebar — persists the collapsed preference and/or the current formation and
 * returns the refreshed DTO. A formation of another owner is a 404, never a 403 revealing it (ET-4).
 */
export function updateSidebar(ctx: ServiceContext, input: unknown): Promise<Result<SidebarDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const body = parseUpdate(input);
    return db.run(async (tx) => {
      if (body.collapsed !== undefined) {
        await tx.execute(sql`
          update public.profiles
          set sidebar_collapsed = ${body.collapsed}
          where id = ${userId}::uuid
        `);
      }
      if (body.currentFormationId !== undefined) {
        await selectCurrentFormationInTx(tx, userId, body.currentFormationId);
      }
      return readSidebar(tx, userId, ctx.clock);
    });
  });
}

async function selectCurrentFormationInTx(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<void> {
  const rows = await tx.execute<IdRow>(sql`
    select id::text as id
    from public.formations
    where id = ${formationId}::uuid
      and owner_id = ${userId}::uuid
      and status in ('active', 'paused')
  `);
  if (rows[0] === undefined) {
    throw new AppError('NOT_FOUND', 'Formation introuvable.');
  }
  await tx.execute(sql`
    update public.profiles
    set current_formation_id = ${formationId}::uuid
    where id = ${userId}::uuid
  `);
}

/**
 * ADR-0075 — opening a formation page makes it the current formation. A formation of another
 * learner or an unknown id is a 404; the sidebar DTO is returned for the same request.
 */
export function selectCurrentFormation(
  ctx: ServiceContext,
  formationId: string,
): Promise<Result<SidebarDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(formationId)) {
      throw new AppError('NOT_FOUND', 'Formation introuvable.');
    }
    return db.run(async (tx) => {
      await selectCurrentFormationInTx(tx, userId, formationId);
      return readSidebar(tx, userId, ctx.clock);
    });
  });
}
