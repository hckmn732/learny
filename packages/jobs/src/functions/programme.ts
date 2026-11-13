import { sql } from '@learny/db';
import { planSchedule, withParams, type PlannerModule } from '@learny/learning-engine';

import { defineFunction } from '../define';

// Initial planning after programme validation (SPEC-605 EF-4, ET-5; SPEC-407). The event carries
// the validated formation id once; a replay finds the planner slots and writes nothing. The job is
// deterministic: it reads the injectable clock and never calls `Date.now()`.

export const PLAN_PROGRAMME_ID = 'plan-programme';

interface FormationRow {
  [key: string]: unknown;
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  volume_hours: number | null;
  timezone: string;
  hours_per_day: number | null;
  study_days: number[] | null;
  preferred_slots: string[] | null;
}

interface ModuleRow {
  [key: string]: unknown;
  id: string;
  position: number;
  title: string;
  planned_end: string | null;
}

interface ChapterRow {
  [key: string]: unknown;
  id: string;
  module_id: string;
  position: number;
}

export const planProgramme = defineFunction(
  {
    id: PLAN_PROGRAMME_ID,
    trigger: { event: 'formation/programme-validated' },
    concurrency: { key: 'event.data.formationId', limit: 1 },
    timeouts: { finish: '10m' },
  },
  async ({ event, ctx }) => {
    const { formationId, userId } = event.data;
    return ctx.sdb.transaction(async (tx) => {
      const formations = await tx.execute<FormationRow>(sql`
        select f.id::text as id,
               f.title,
               f.start_date::text as start_date,
               f.end_date::text as end_date,
               f.volume_hours,
               p.timezone,
               sp.hours_per_day,
               sp.study_days,
               sp.preferred_slots::text[] as preferred_slots
        from public.formations f
        join public.profiles p on p.id = f.owner_id
        left join public.study_preferences sp on sp.user_id = f.owner_id
        where f.id = ${formationId}::uuid
          and f.owner_id = ${userId}::uuid
        limit 1
      `);
      const formation = formations[0];
      if (formation === undefined) return { planned: 0, reason: 'formation absente' };

      const modules = await tx.execute<ModuleRow>(sql`
        select id::text as id, position, title, planned_end::text as planned_end
        from public.modules
        where formation_id = ${formationId}::uuid
        order by position asc
      `);
      if (modules.length === 0) return { planned: 0, reason: 'programme vide' };

      const chapters = await tx.execute<ChapterRow>(sql`
        select c.id::text as id, c.module_id::text as module_id, c.position
        from public.chapters c
        join public.modules m on m.id = c.module_id
        where m.formation_id = ${formationId}::uuid
        order by c.position asc
      `);
      const byModule = new Map<string, ChapterRow[]>();
      for (const chapter of chapters) {
        const list = byModule.get(chapter.module_id) ?? [];
        list.push(chapter);
        byModule.set(chapter.module_id, list);
      }

      const existing = await tx.execute<{ count: number }>(sql`
        select count(*)::int as count
        from public.schedule_slots
        where user_id = ${userId}::uuid
          and formation_id = ${formationId}::uuid
          and planner_key is not null
      `);
      if ((existing[0]?.count ?? 0) > 0) return { planned: 0, reason: 'déjà planifié' };

      const volume = Math.max(modules.length, formation.volume_hours ?? modules.length * 2);
      const hoursPerModule = Math.max(1, Math.floor(volume / modules.length));
      const plannerModules: PlannerModule[] = modules.map((module) => ({
        moduleId: module.id,
        position: module.position,
        title: module.title,
        hours: hoursPerModule,
        chapters: (byModule.get(module.id) ?? []).map((chapter) => ({
          chapterId: chapter.id,
          position: chapter.position,
        })),
        hasExercise: true,
        ...(module.planned_end === null ? {} : { deadline: module.planned_end }),
      }));

      const now = ctx.clock.now();
      const endDate =
        formation.end_date ??
        modules.at(-1)?.planned_end ??
        new Date(now.getTime() + 42 * 86_400_000).toISOString().slice(0, 10);
      const plan = planSchedule({
        formations: [
          {
            formationId,
            title: formation.title,
            endDate,
            status: 'active',
            modules: plannerModules,
          },
        ],
        preferences: {
          tz: formation.timezone,
          availability: {
            hoursPerDay: formation.hours_per_day ?? 2,
            studyDays: (formation.study_days ?? [1, 2, 3, 4, 5]) as (1 | 2 | 3 | 4 | 5 | 6 | 7)[],
            preferredSlots: (formation.preferred_slots ?? ['soir']) as (
              'matin' | 'apres_midi' | 'soir'
            )[],
          },
        },
        params: withParams('planner'),
        now: now.toISOString(),
      });

      const slots = plan.slots.filter(
        (slot) => slot.formationId === formationId && slot.status === 'planned',
      );
      for (const slot of slots) {
        await tx.execute(sql`
          insert into public.schedule_slots (
            user_id, formation_id, module_id, kind, title, starts_at, ends_at, status,
            created_by, planner_key, created_at, updated_at
          )
          values (
            ${userId}::uuid,
            ${formationId}::uuid,
            ${slot.moduleId}::uuid,
            ${slot.kind}::public.slot_kind,
            ${slot.title},
            ${slot.startsAt}::timestamptz,
            ${slot.endsAt}::timestamptz,
            'planned'::public.slot_status,
            'planner'::public.slot_creator,
            ${slot.slotId},
            ${now.toISOString()}::timestamptz,
            ${now.toISOString()}::timestamptz
          )
          on conflict do nothing
        `);
      }
      ctx.logger.info('initial programme planned', {
        job: PLAN_PROGRAMME_ID,
        status: 'planned',
        resultCount: slots.length,
        outcome: plan.conflicts.length === 0 ? 'ok' : 'conflicts',
      });
      return { planned: slots.length, conflicts: plan.conflicts.length };
    });
  },
);
