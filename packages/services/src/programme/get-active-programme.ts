import { z } from 'zod';

import {
  ActiveProgrammeDto,
  type ActiveProgrammeChapterDto,
  type ActiveProgrammeDto as ActiveProgrammeDtoType,
  type ActiveProgrammeFormationStatus,
  type ActiveProgrammeModuleDto,
  type ProgrammeModuleStatus,
  type ProgrammeScreenStateDto,
} from '@learny/contracts';
import { AppError, userLocalDay, type Result } from '@learny/core';
import { sql, type DbTx } from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { calendarWeeks, programmeIndicators } from './progress';
import { readFormation, readProfile, readProgrammeState, type FormationRow } from './state';

// Read model of the active programme (SPEC-606 EF-1 to EF-4, ET-1, ET-3). Every query runs in the
// learner's RLS transaction: another owner gets the same NOT_FOUND as an unknown formation.
// `module_progress` is the source of truth for the learner's statuses and best scores; the module
// and chapter rows come from the validated structure, never from a client-side proposal.

const ACTIVE_STATUSES = new Set<ActiveProgrammeFormationStatus>(['active', 'paused', 'completed']);
const UUID = z.uuid();

interface ModuleRow {
  [key: string]: unknown;
  id: string;
  position: number;
  title: string;
  objectives: string[];
  planned_start: string | null;
  planned_end: string | null;
  threshold: number;
  status: string;
  best_score: string | number | null;
}

interface ChapterRow {
  [key: string]: unknown;
  id: string;
  module_id: string;
  position: number;
  title: string;
  contributions_status: string | null;
}

interface PreferenceRow {
  [key: string]: unknown;
  hours_per_day: number;
  study_days: number;
}

function invalidFormationId(): AppError {
  return new AppError('VALIDATION_FAILED', 'Identifiant de formation invalide.', {
    errors: [{ path: 'fid', message: 'Un UUID est attendu.' }],
  });
}

function parseFormationId(formationId: string): string {
  const parsed = UUID.safeParse(formationId);
  if (!parsed.success) throw invalidFormationId();
  return parsed.data;
}

function activeStatus(value: string): ActiveProgrammeFormationStatus {
  if ((ACTIVE_STATUSES as ReadonlySet<string>).has(value)) {
    return value as ActiveProgrammeFormationStatus;
  }
  throw new AppError('CONFLICT', 'Le programme n’est pas encore actif.', { status: 409 });
}

function moduleStatus(value: string): ProgrammeModuleStatus {
  if (value === 'locked' || value === 'open' || value === 'validated') return value;
  throw new AppError('INTERNAL_ERROR', 'Statut de module inconnu.');
}

function contributionStatus(value: string | null): 'in_progress' | 'done' {
  return value === 'done' ? 'done' : 'in_progress';
}

function scoreOf(value: string | number | null): number | null {
  if (value === null) return null;
  const score = Number(value);
  return Number.isFinite(score) ? score : null;
}

async function readPreference(
  tx: DbTx,
  userId: string,
): Promise<{ hoursPerDay: number; studyDaysPerWeek: number }> {
  const rows = await tx.execute<PreferenceRow>(sql`
    select hours_per_day,
           coalesce(array_length(study_days, 1), 5)::int as study_days
    from public.study_preferences
    where user_id = ${userId}::uuid
    limit 1
  `);
  const row = rows[0];
  return {
    hoursPerDay: row?.hours_per_day ?? 2,
    studyDaysPerWeek: row?.study_days ?? 5,
  };
}

function moduleHref(formationId: string, moduleId: string): string {
  return `/formations/${encodeURIComponent(formationId)}/modules/${encodeURIComponent(moduleId)}`;
}

function chapterHref(formationId: string, moduleId: string, chapterId: string): string {
  return `${moduleHref(formationId, moduleId)}/cours?chapitre=${encodeURIComponent(chapterId)}`;
}

function requireDate(value: string | null, label: string): string {
  if (value === null) {
    throw new AppError('CONFLICT', `Le programme n’a pas de date de ${label}.`, { status: 409 });
  }
  return value;
}

/**
 * Builds the active DTO from the rows of one transaction. The last module carries the mock-exam
 * marker (`quizKind: 'exam'`), the others the validation quiz at their planned end.
 */
export async function readActiveProgramme(
  tx: DbTx,
  userId: string,
  formationId: string,
  now: Date,
  knownFormation?: FormationRow,
): Promise<ActiveProgrammeDtoType> {
  const formation = knownFormation ?? (await readFormation(tx, userId, formationId));
  if (formation === null) throw new AppError('NOT_FOUND', 'Formation introuvable.');
  const status = activeStatus(formation.status);
  const profile = await readProfile(tx, userId);
  const preference = await readPreference(tx, userId);

  const moduleRows = await tx.execute<ModuleRow>(sql`
    select m.id::text as id,
           m.position,
           m.title,
           m.objectives::text[] as objectives,
           m.planned_start::text as planned_start,
           m.planned_end::text as planned_end,
           m.threshold,
           coalesce(mp.status, m.status)::text as status,
           mp.best_score
    from public.modules m
    left join public.module_progress mp
      on mp.module_id = m.id and mp.user_id = ${userId}::uuid
    where m.formation_id = ${formationId}::uuid
    order by m.position asc
  `);
  if (moduleRows.length === 0) {
    throw new AppError('CONFLICT', 'Aucun module n’est planifié pour ce programme.', {
      status: 409,
    });
  }

  const chapterRows = await tx.execute<ChapterRow>(sql`
    select c.id::text as id,
           c.module_id::text as module_id,
           c.position,
           c.title,
           cp.contributions_status::text as contributions_status
    from public.chapters c
    join public.modules m on m.id = c.module_id
    left join public.chapter_progress cp
      on cp.chapter_id = c.id and cp.user_id = ${userId}::uuid
    where m.formation_id = ${formationId}::uuid
    order by m.position asc, c.position asc
  `);

  const lastPosition = moduleRows.at(-1)?.position ?? 1;
  const modules: ActiveProgrammeModuleDto[] = moduleRows.map((row) => {
    const status = moduleStatus(row.status);
    const locked = status === 'locked';
    const plannedStart = requireDate(row.planned_start, 'début');
    const plannedEnd = requireDate(row.planned_end, 'fin');
    return {
      id: row.id,
      position: row.position,
      title: row.title,
      objectives: row.objectives,
      plannedStart,
      plannedEnd,
      threshold: row.threshold,
      status,
      score: scoreOf(row.best_score),
      quizOn: plannedEnd,
      quizKind: row.position === lastPosition ? 'exam' : 'quiz',
      unlockAfterPosition: locked && row.position > 1 ? row.position - 1 : null,
      href: locked ? null : moduleHref(formationId, row.id),
    };
  });

  const chapters: ActiveProgrammeChapterDto[] = chapterRows.map((row) => ({
    id: row.id,
    moduleId: row.module_id,
    position: row.position,
    title: row.title,
    contributionsStatus: contributionStatus(row.contributions_status),
    courseHref: chapterHref(formationId, row.module_id, row.id),
  }));

  const first = modules[0];
  const last = modules.at(-1);
  if (first === undefined || last === undefined) {
    throw new AppError('CONFLICT', 'Aucun module n’est planifié pour ce programme.', {
      status: 409,
    });
  }

  const dto = {
    formation: {
      id: formation.id,
      title: formation.title,
      description: formation.description,
      objectives: formation.objectives,
      volumeHours: formation.volume_hours,
      startDate: formation.start_date,
      endDate: formation.end_date,
      threshold: formation.default_threshold,
      status,
    },
    indicators: programmeIndicators({
      status,
      modules,
      weeks: calendarWeeks(first.plannedStart, last.plannedEnd),
      volumeHours: formation.volume_hours,
      threshold: formation.default_threshold,
      hoursPerDay: preference.hoursPerDay,
      studyDaysPerWeek: preference.studyDaysPerWeek,
    }),
    modules,
    chapters,
    calendar: modules.map((module) => ({
      moduleId: module.id,
      position: module.position,
      title: module.title,
      start: module.plannedStart,
      end: module.plannedEnd,
      status: module.status,
      quizOn: module.quizOn,
      quizKind: module.quizKind,
    })),
    today: userLocalDay(now, profile.timezone),
    timeZone: profile.timezone,
  };
  return ActiveProgrammeDto.parse(dto);
}

/** GET /formations/:fid/programme of an active, paused or completed formation. */
export function getActiveProgramme(
  ctx: ServiceContext,
  formationId: string,
): Promise<Result<ActiveProgrammeDtoType>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const fid = parseFormationId(formationId);
    return db.run((tx) => readActiveProgramme(tx, userId, fid, ctx.clock.now()));
  });
}

/**
 * ET-3 — the same GET route serves the proposed programme (SPEC-605) and the active one. The
 * formation status is read once with RLS, so another owner stays a 404 in both branches.
 */
export function getProgrammeScreenState(
  ctx: ServiceContext,
  formationId: string,
): Promise<Result<ProgrammeScreenStateDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const fid = parseFormationId(formationId);
    return db.run(async (tx) => {
      const formation = await readFormation(tx, userId, fid);
      if (formation === null) throw new AppError('NOT_FOUND', 'Formation introuvable.');
      if ((ACTIVE_STATUSES as ReadonlySet<string>).has(formation.status)) {
        return readActiveProgramme(tx, userId, fid, ctx.clock.now(), formation);
      }
      return readProgrammeState(tx, userId, fid);
    });
  });
}
