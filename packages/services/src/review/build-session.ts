import { ENGINE } from '@learny/config/product';
import { AppError, toUserZone, type Result } from '@learny/core';
import { sql } from '@learny/db';
import {
  buildDailySession,
  type BrickFormat,
  type DailySession,
  type GlobalQuizBank,
  type GlobalQuizGap,
} from '@learny/learning-engine';

import type { ServiceContext } from '../context';
import { isUuid } from '../formations/final-review';
import { getDueNotions } from '../learning/get-due-notions';
import { requireUser, toResult } from '../resources/result';

// Maintenance session of a completed formation (SPEC-617 ET-4, EF-2; BR-FOR-12, ADR-0015).
//
// `light` delegates to the SPEC-406 draw with the five-minute bound and only the due notions of
// validated modules. `stopped` excludes the formation entirely: the future quiz-global endpoint
// answers 404 (SPEC-701 CL-10). Nothing is persisted here and no FSRS state changes.

const QUIZ_FORMATS = new Set<string>([
  'choice_question',
  'open_question',
  'cloze',
  'matching',
  'ordering',
  'categorization',
  'recall_card',
]);

interface FormationRow extends Record<string, unknown> {
  id: string;
  status: string;
  maintenance_mode: 'light' | 'stopped' | null;
  timezone: string;
}

interface BrickRow extends Record<string, unknown> {
  type: string;
  notion_ids: string[];
}

export interface MaintenanceSession {
  formationId: string;
  date: string;
  mode: 'maintenance';
  /** Effective cap, bounded by `ENGINE.globalQuiz.maintenanceMaxMinutes` (five minutes). */
  capMinutes: number;
  dueCount: number;
  notionCount: number;
  estimatedMinutes: number;
  items: DailySession['items'];
  deferred: DailySession['deferred'];
}

/**
 * ET-4 — draws the light interview of a completed formation. A stopped interview is a 404, like
 * an inaccessible formation; an unfinished formation or an unchosen mode is a 409.
 */
export function buildMaintenanceSession(
  ctx: ServiceContext,
  formationId: string,
): Promise<Result<MaintenanceSession>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    if (!isUuid(formationId)) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant de formation invalide.');
    }
    const now = ctx.clock.now();
    const formation = await db.run(async (tx) => {
      const rows = await tx.execute<FormationRow>(sql`
        select f.id::text as id,
               f.status::text as status,
               f.maintenance_mode::text as maintenance_mode,
               p.timezone
        from public.formations f
        join public.profiles p on p.id = ${userId}::uuid
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
      return rows[0];
    });
    if (formation === undefined) throw new AppError('NOT_FOUND', 'Formation introuvable.');
    if (formation.maintenance_mode === 'stopped') {
      throw new AppError('NOT_FOUND', 'Formation introuvable.');
    }
    if (formation.status !== 'completed' || formation.maintenance_mode !== 'light') {
      throw new AppError(
        'CONFLICT',
        'L’entretien de mémoire léger n’est pas actif pour cette formation.',
        { status: 409 },
      );
    }

    const due = await getDueNotions(ctx, formationId, now);
    if (!due.ok) throw due.error;
    const bricks = await db.run((tx) =>
      tx.execute<BrickRow>(sql`
        select b.type::text as type, b.notion_ids::text[] as notion_ids
        from public.bricks b
        where b.owner_id = ${userId}::uuid
          and b.formation_id = ${formationId}::uuid
          and b.status = 'active'
      `),
    );
    const byNotion = new Map<string, Set<BrickFormat>>();
    for (const brick of bricks) {
      if (!QUIZ_FORMATS.has(brick.type)) continue;
      for (const notionId of brick.notion_ids) {
        const formats = byNotion.get(notionId) ?? new Set<BrickFormat>();
        formats.add(brick.type as BrickFormat);
        byNotion.set(notionId, formats);
      }
    }
    const bank: GlobalQuizBank[] = due.value.notions.map((notion) => ({
      notionId: notion.notionId,
      formats: [...(byNotion.get(notion.notionId) ?? [])],
    }));
    const gaps: GlobalQuizGap[] = due.value.gaps;
    const timezone = formation.timezone;
    const date = toUserZone(now, timezone).date;

    const session = buildDailySession({
      formationId,
      date,
      dueNotions: due.value.notions.map((notion) => ({
        notionId: notion.notionId,
        moduleId: notion.moduleId,
        modulePosition: notion.modulePosition,
        moduleStatus: notion.moduleStatus,
        evaluated: notion.evaluated,
        dueAt: notion.dueAt,
      })),
      gaps,
      bank,
      lastFormats: [],
      capMinutes: ENGINE.globalQuiz.maintenanceMaxMinutes,
      mode: 'maintenance',
      seed: `maintenance:${formationId}:${date}`,
      params: {
        notionCostSec: ENGINE.globalQuiz.notionCostSec,
        sessionOverheadSec: ENGINE.globalQuiz.sessionOverheadSec,
        formatSeconds: ENGINE.globalQuiz.formatSeconds,
        maintenanceMaxMinutes: ENGINE.globalQuiz.maintenanceMaxMinutes,
      },
    });

    return {
      formationId,
      date,
      mode: 'maintenance',
      capMinutes: session.capMinutes,
      dueCount: due.value.notions.length,
      notionCount: new Set(session.items.map((item) => item.notionId)).size,
      estimatedMinutes: session.estimatedMinutes,
      items: session.items,
      deferred: session.deferred,
    };
  });
}
