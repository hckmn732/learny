// Agenda aggregation of the authenticated learner (SPEC-704 ET-2, BR-AGE-01, BR-AGE-04,
// BR-AGE-06; ADR-0183, ADR-0030). One read-only call behind RLS: the slots of another learner,
// the `moved` and `cancelled` statuses and the formations outside the filter never reach the DTO.
// The service computes the local day and minutes of every slot from the learner's profile zone and
// never reads a clock itself (ADR-0047) — `now` comes from the injected clock of the context.
import { agendaSlotLabelOf } from '@learny/config';
import { ENGINE } from '@learny/config/product';
import type { AgendaDto, AgendaSlot, AgendaTotals } from '@learny/contracts';
import {
  AppError,
  addCivilDays,
  endOfUserDay,
  startOfUserDay,
  toUserZone,
  userLocalDay,
  type Result,
} from '@learny/core';
import { sql } from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

interface ProfileAgendaRow {
  timezone: string;
  current_formation_id: string | null;
  study_days: (number | string)[] | null;
  [key: string]: unknown;
}

interface FormationAgendaRow {
  id: string;
  title: string;
  monogram: string;
  status: 'active' | 'paused' | 'completed';
  start_date: string | null;
  end_date: string | null;
  [key: string]: unknown;
}

interface SlotAgendaRow {
  id: string;
  formation_id: string;
  module_id: string | null;
  module_number: number | null;
  kind: string;
  title: string;
  meta: string | null;
  starts_at: Date | string;
  ends_at: Date | string;
  status: string;
  activity_id: string | null;
  group_milestone: boolean;
  [key: string]: unknown;
}

interface ModuleAgendaRow {
  id: string;
  formation_id: string;
  position: number;
  title: string;
  planned_end: string | null;
  status: string;
  [key: string]: unknown;
}

function instantOf(value: Date | string): Date {
  return value instanceof Date ? new Date(value.getTime()) : new Date(value);
}

/** ET-5 — target of the « Ouvrir » action of a slot. */
export function agendaSlotHref(input: {
  kind: string;
  formationId: string;
  moduleId: string | null;
  activityId: string | null;
  date: string;
}): string {
  const base = `/formations/${input.formationId}`;
  switch (input.kind) {
    case 'contributions':
      return input.moduleId === null ? base : `${base}/modules/${input.moduleId}`;
    case 'course':
      return input.moduleId === null ? base : `${base}/modules/${input.moduleId}/cours`;
    case 'exercise':
      if (input.moduleId === null) return `${base}/programme`;
      return input.activityId === null
        ? `${base}/modules/${input.moduleId}`
        : `${base}/modules/${input.moduleId}/exercices/${input.activityId}`;
    case 'validation_quiz':
      return input.moduleId === null ? base : `${base}/modules/${input.moduleId}/quiz`;
    case 'mock_exam':
      return `${base}/examen-blanc`;
    case 'global_quiz':
    case 'revision':
    case 'sprint':
      return `${base}/quiz-global`;
    case 'micro_session':
      return `${base}/quiz-global?mode=micro`;
    case 'warmup':
      return '/accueil#echauffement';
    case 'weekly_review':
      return '/accueil#bilan';
    case 'buffer':
      return `/agenda?vue=jour&date=${input.date}`;
    default:
      return base;
  }
}

/** EF-11 — totals of the period: planned and done minutes outside the margins, margin count. */
export function agendaTotals(slots: readonly AgendaSlot[]): AgendaTotals {
  let plannedMinutes = 0;
  let doneMinutes = 0;
  let marginsRemaining = 0;
  for (const slot of slots) {
    const duration = Math.max(
      0,
      Math.round((instantOf(slot.endsAt).getTime() - instantOf(slot.startsAt).getTime()) / 60_000),
    );
    if (slot.kind === 'buffer') {
      if (slot.status === 'planned') marginsRemaining += 1;
      continue;
    }
    plannedMinutes += duration;
    if (slot.status === 'done') doneMinutes += duration;
  }
  return { plannedMinutes, doneMinutes, marginsRemaining };
}

/**
 * ET-2 — reads the agenda of one learner for a civil window: slots (`planned|done|missed`),
 * formations on display, navigation bounds, caption period and period totals. The window is at
 * most 42 days and a foreign formation gives a 404.
 */
export function getAgenda(
  ctx: ServiceContext,
  params: { from: string; to: string; formation: string },
): Promise<Result<AgendaDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const now = ctx.clock.now();
    return db.run(async (tx) => {
      const profileRows = await tx.execute<ProfileAgendaRow>(sql`
        select p.timezone,
               p.current_formation_id::text as current_formation_id,
               sp.study_days
        from public.profiles p
        left join public.study_preferences sp on sp.user_id = p.id
        where p.id = ${userId}::uuid
      `);
      const profile = profileRows[0];
      if (profile === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
      const timezone = profile.timezone;

      const formations = await tx.execute<FormationAgendaRow>(sql`
        select f.id::text as id,
               f.title,
               f.monogram,
               f.status::text as status,
               f.start_date::text as start_date,
               f.end_date::text as end_date
        from public.formations f
        where (f.owner_id = ${userId}::uuid or exists (
          select 1 from public.groups g
          join public.group_members gm on gm.group_id = g.id
          where g.formation_id = f.id
            and gm.user_id = ${userId}::uuid
            and gm.member_status = 'active'
        ))
          and f.status::text in ('active', 'paused', 'completed')
        order by f.created_at asc, f.id asc
      `);

      const formationFilter =
        params.formation === 'all'
          ? null
          : (formations.find((formation) => formation.id === params.formation) ?? null);
      if (params.formation !== 'all' && formationFilter === null) {
        throw new AppError('NOT_FOUND', 'Formation introuvable dans votre agenda.');
      }
      const visible = formationFilter === null ? formations : [formationFilter];
      const visibleIds = new Set(visible.map((formation) => formation.id));

      // SPEC-705 EF-2 — a non-validated module whose planned end is at least the configured delay
      // in the past drives the BR-FOR-14 proposal. The interface only receives the first one; the
      // detailed quiz-failure case is refined by the replanning service.
      const moduleRows = await tx.execute<ModuleAgendaRow>(sql`
        select m.id::text as id,
               m.formation_id::text as formation_id,
               m.position::int as position,
               m.title,
               m.planned_end::text as planned_end,
               m.status::text as status
        from public.modules m
        join public.formations f on f.id = m.formation_id
        where (f.owner_id = ${userId}::uuid or exists (
          select 1 from public.groups g
          join public.group_members gm on gm.group_id = g.id
          where g.formation_id = f.id
            and gm.user_id = ${userId}::uuid
            and gm.member_status = 'active'
        ))
          and f.status::text in ('active', 'paused')
          and m.status::text <> 'validated'
          and (${params.formation} = 'all' or m.formation_id::text = ${params.formation})
        order by m.position asc, m.id asc
      `);
      const blockedCutoff = addCivilDays(
        userLocalDay(now, timezone),
        -ENGINE.planner.blockedDelayDays,
      );
      const blockedRow = moduleRows.find(
        (module) =>
          visibleIds.has(module.formation_id) &&
          module.planned_end !== null &&
          module.planned_end <= blockedCutoff,
      );
      const blockedModule =
        blockedRow === undefined
          ? null
          : {
              formationId: blockedRow.formation_id,
              moduleId: blockedRow.id,
              moduleNumber: blockedRow.position,
              title: blockedRow.title,
              reason: 'delayed' as const,
            };

      const starts = visible
        .map((formation) => formation.start_date)
        .filter((date): date is string => date !== null)
        .sort();
      const ends = visible
        .map((formation) => formation.end_date)
        .filter((date): date is string => date !== null)
        .sort();
      const firstStart = starts[0];
      const lastEnd = ends[ends.length - 1];
      const bounds =
        firstStart === undefined || lastEnd === undefined
          ? null
          : { start: firstStart, end: lastEnd };

      const current = formations.find((formation) => formation.id === profile.current_formation_id);
      let captionPeriod: { start: string; end: string } | null = null;
      if (formationFilter !== null) {
        if (formationFilter.start_date !== null && formationFilter.end_date !== null) {
          captionPeriod = { start: formationFilter.start_date, end: formationFilter.end_date };
        }
      } else if (
        current !== undefined &&
        current.start_date !== null &&
        current.end_date !== null
      ) {
        captionPeriod = { start: current.start_date, end: current.end_date };
      } else {
        captionPeriod = bounds;
      }

      const rows = await tx.execute<SlotAgendaRow>(sql`
        select ss.id::text as id,
               ss.formation_id::text as formation_id,
               ss.module_id::text as module_id,
               m.position::int as module_number,
               ss.kind::text as kind,
               ss.title,
               ss.meta,
               ss.starts_at,
               ss.ends_at,
               ss.status::text as status,
               ss.activity_id::text as activity_id,
               ss.group_milestone
        from public.schedule_slots ss
        left join public.modules m on m.id = ss.module_id
        where ss.user_id = ${userId}::uuid
          and ss.status in ('planned', 'done', 'missed')
          and ss.starts_at >= ${startOfUserDay(params.from, timezone).toISOString()}::timestamptz
          and ss.starts_at <= ${endOfUserDay(params.to, timezone).toISOString()}::timestamptz
          ${
            params.formation === 'all'
              ? sql``
              : sql`and ss.formation_id = ${params.formation}::uuid`
          }
        order by ss.starts_at asc, ss.id asc
      `);

      const slots: AgendaSlot[] = [];
      for (const row of rows) {
        const startsAt = instantOf(row.starts_at);
        const endsAt = instantOf(row.ends_at);
        const date = userLocalDay(startsAt, timezone);
        if (date < params.from || date > params.to) continue;
        const wall = toUserZone(startsAt, timezone);
        const wallEnd = toUserZone(endsAt, timezone);
        const kind = row.kind;
        const meta =
          row.group_milestone && (row.meta === null || row.meta === '')
            ? 'Jalon du groupe'
            : row.meta;
        slots.push({
          id: row.id,
          formationId: row.formation_id,
          moduleId: row.module_id,
          moduleNumber: row.module_number,
          kind: kind as AgendaSlot['kind'],
          typeLabel: agendaSlotLabelOf(kind),
          title: row.title,
          meta,
          date,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          startMinutes: wall.hour * 60 + wall.minute,
          endMinutes: wallEnd.hour * 60 + wallEnd.minute,
          status: row.status as AgendaSlot['status'],
          href: agendaSlotHref({
            kind,
            formationId: row.formation_id,
            moduleId: row.module_id,
            activityId: row.activity_id,
            date,
          }),
          activityId: row.activity_id,
          movable: row.status === 'planned' && startsAt.getTime() > now.getTime(),
        });
      }

      const studyDays = (profile.study_days ?? [1, 2, 3, 4, 5])
        .map((day) => Number(day))
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
        .sort((left, right) => left - right);

      return {
        timezone,
        today: userLocalDay(now, timezone),
        currentFormationId: profile.current_formation_id,
        bounds,
        captionPeriod,
        studyDays,
        formations: visible.map((formation) => ({
          id: formation.id,
          title: formation.title,
          sigle: formation.monogram,
          status: formation.status,
        })),
        slots,
        totals: agendaTotals(slots),
        blockedModule,
      };
    });
  });
}
