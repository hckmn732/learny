// Due notions of one formation for the learner (SPEC-411 EF-3, ET-2, ET-5).
//
// The query goes through the user's RLS client only: `notion_states` belongs to the caller,
// `notions` are visible to a formation owner or member, and `module_progress` is the caller's own
// status. The DTO carries no FSRS card, no user identifier and no answer: SPEC-406 receives the
// minimal fields needed to build the daily session. Another learner's state is never counted,
// even in a shared formation.
import { sql } from 'drizzle-orm';

import { DueNotionsSchema, type DueNotion, type DueNotions } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

interface DueRow {
  [key: string]: unknown;
  notion_id: string;
  label: string;
  chapter_id: string;
  module_id: string;
  module_position: number;
  module_status: string;
  evaluated: boolean;
  due_at: Date;
  mastery: string;
  gap_nature: string | null;
}

const MODULE_STATUSES = new Set(['locked', 'open', 'validated']);
const GAP_NATURES = new Set(['forgetting', 'confusion', 'misunderstanding', 'application']);

function moduleStatus(value: string): DueNotion['moduleStatus'] {
  if (!MODULE_STATUSES.has(value)) {
    throw new AppError('INTERNAL_ERROR', 'Statut de module inconnu.');
  }
  return value as DueNotion['moduleStatus'];
}

function gapNature(value: string | null): DueNotion['gapNature'] {
  if (value === null) return null;
  if (!GAP_NATURES.has(value)) {
    throw new AppError('INTERNAL_ERROR', 'Nature de lacune inconnue.');
  }
  return value as NonNullable<DueNotion['gapNature']>;
}

/**
 * EF-3, ET-2 — due notions of `formationId` at `at`: `in_review`, not suspended and
 * `due_at <= at`. The role of the module comes from `module_progress` (the learner's status),
 * falling back to the mirrored module status; `evaluated` marks a module with a graded attempt.
 */
export async function getDueNotions(
  ctx: ServiceContext,
  formationId: string,
  at: Date,
): Promise<Result<DueNotions>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run(async (tx) => {
      const formation = await tx.execute<{ id: string }>(sql`
        select id::text as id
        from public.formations
        where id = ${formationId}::uuid
      `);
      if (formation[0] === undefined) {
        throw new AppError('NOT_FOUND', 'Formation introuvable.');
      }

      const rows = await tx.execute<DueRow>(sql`
        select
          ns.notion_id::text as notion_id,
          n.label,
          n.chapter_id::text as chapter_id,
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
          ns.mastery::text as mastery,
          ns.gap_nature::text as gap_nature
        from public.notion_states ns
        join public.notions n on n.id = ns.notion_id
        join public.modules m on m.id = n.module_id
        join public.formations f on f.id = n.formation_id
        left join public.module_progress mp
          on mp.user_id = ns.user_id and mp.module_id = m.id
        where ns.user_id = ${userId}::uuid
          and n.formation_id = ${formationId}::uuid
          and ns.in_review
          and not ns.suspended
          and ns.due_at <= ${at.toISOString()}::timestamptz
        order by m.position, ns.due_at, n.position, n.id
      `);

      const notions: DueNotion[] = rows.map((row) => ({
        notionId: row.notion_id,
        label: row.label,
        chapterId: row.chapter_id,
        moduleId: row.module_id,
        modulePosition: row.module_position,
        moduleStatus: moduleStatus(row.module_status),
        evaluated: row.evaluated,
        dueAt: row.due_at.toISOString(),
        mastery: Number(row.mastery),
        gapNature: gapNature(row.gap_nature),
      }));
      const gaps = notions
        .filter((notion) => notion.gapNature !== null)
        .map((notion) => ({
          notionId: notion.notionId,
          nature: notion.gapNature as NonNullable<DueNotion['gapNature']>,
        }));

      return DueNotionsSchema.parse({
        formationId,
        at: at.toISOString(),
        notions,
        gaps,
      });
    });
  });
}
