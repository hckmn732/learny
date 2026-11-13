import { sql } from 'drizzle-orm';

import {
  GapListDto,
  GapListQuery,
  LEARNING_GAP_NATURES,
  type GapCard,
  type GapCountsByNature,
  type GapNature,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import type { DbTx } from '@learny/db';
import { RECOMMENDED_ACTION_BY_NATURE } from '@learny/learning-engine';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { courseTarget, trainingTarget } from './links';

// Read model of « Mes lacunes » (SPEC-615 EF-1, EF-2, ET-1, ET-3, ET-5; BR-LAC-05).
//
// Everything is read with the learner's RLS client: a formation of another learner is invisible
// and therefore a 404, never an empty page revealing its existence. The counters are computed on
// all open gaps in the same transaction as the filtered cards, so switching a filter never changes
// a persisted row. The revealed evidence comes from the latest detection/change event, and the
// course link only uses a live section of the learner's current course.

const NATURE_ORDER = sql`
  case ns.gap_nature
    when 'confusion' then 0
    when 'misunderstanding' then 1
    when 'application' then 2
    else 3
  end
`;

interface FormationRow {
  [key: string]: unknown;
  id: string;
  title: string;
  timezone: string;
}

interface SummaryRow {
  [key: string]: unknown;
  open_gaps: number;
  mastered_notions: number;
  gap_modules: number[] | null;
  mastered_modules: number[] | null;
}

interface CountRow {
  [key: string]: unknown;
  forgetting: number;
  confusion: number;
  misunderstanding: number;
  application: number;
}

interface GapRow {
  [key: string]: unknown;
  notion_id: string;
  notion_label: string;
  nature: GapNature;
  confused_with_label: string | null;
  module_id: string;
  module_position: number;
  module_title: string;
  chapter_id: string;
  chapter_title: string;
  threshold: number;
  mastery: number;
  detected_at: string | Date | null;
  revealed_by: string;
  section_id: string | null;
  section_anchor: string | null;
}

interface NextReviewRow {
  [key: string]: unknown;
  next_review_at: string | Date | null;
}

async function readFormation(tx: DbTx, userId: string, formationId: string): Promise<FormationRow> {
  const rows = await tx.execute<FormationRow>(sql`
    select f.id::text as id,
           f.title,
           p.timezone
    from public.formations f
    join public.profiles p on p.id = ${userId}::uuid
    where f.id = ${formationId}::uuid
  `);
  const formation = rows[0];
  if (formation === undefined) {
    throw new AppError('NOT_FOUND', 'Formation introuvable.');
  }
  return formation;
}

async function readSummary(tx: DbTx, userId: string, formationId: string): Promise<SummaryRow> {
  const rows = await tx.execute<SummaryRow>(sql`
    select count(*) filter (
             where ns.gap_nature is not null and ns.gap_cleared_at is null
           )::int as open_gaps,
           count(*) filter (where ns.mastery >= m.threshold)::int as mastered_notions,
           array_agg(distinct m.position order by m.position) filter (
             where ns.gap_nature is not null and ns.gap_cleared_at is null
           ) as gap_modules,
           array_agg(distinct m.position order by m.position) filter (
             where ns.mastery >= m.threshold
           ) as mastered_modules
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    join public.modules m on m.id = n.module_id
    where ns.user_id = ${userId}::uuid
      and n.formation_id = ${formationId}::uuid
  `);
  return (
    rows[0] ?? {
      open_gaps: 0,
      mastered_notions: 0,
      gap_modules: null,
      mastered_modules: null,
    }
  );
}

async function readCounts(
  tx: DbTx,
  userId: string,
  formationId: string,
): Promise<GapCountsByNature> {
  const rows = await tx.execute<CountRow>(sql`
    select count(*) filter (where ns.gap_nature = 'forgetting')::int as forgetting,
           count(*) filter (where ns.gap_nature = 'confusion')::int as confusion,
           count(*) filter (where ns.gap_nature = 'misunderstanding')::int as misunderstanding,
           count(*) filter (where ns.gap_nature = 'application')::int as application
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    where ns.user_id = ${userId}::uuid
      and n.formation_id = ${formationId}::uuid
      and ns.gap_nature is not null
      and ns.gap_cleared_at is null
  `);
  const row = rows[0];
  return {
    forgetting: Math.max(0, row?.forgetting ?? 0),
    confusion: Math.max(0, row?.confusion ?? 0),
    misunderstanding: Math.max(0, row?.misunderstanding ?? 0),
    application: Math.max(0, row?.application ?? 0),
  };
}

async function readGapRows(
  tx: DbTx,
  userId: string,
  formationId: string,
  nature: GapNature | undefined,
): Promise<GapRow[]> {
  const natureFilter =
    nature === undefined ? sql`` : sql`and ns.gap_nature = ${nature}::public.gap_nature`;
  return tx.execute<GapRow>(sql`
    select n.id::text as notion_id,
           n.label as notion_label,
           ns.gap_nature::text as nature,
           confused.label as confused_with_label,
           n.module_id::text as module_id,
           m.position::int as module_position,
           m.title as module_title,
           n.chapter_id::text as chapter_id,
           c.title as chapter_title,
           m.threshold::int as threshold,
           ns.mastery::float8 as mastery,
           ns.gap_detected_at as detected_at,
           coalesce(
             nullif(event.evidence->>'summary', ''),
             nullif(ns.gap_evidence, ''),
             ''
           ) as revealed_by,
           section.id::text as section_id,
           section.anchor as section_anchor
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    join public.modules m on m.id = n.module_id
    join public.chapters c on c.id = n.chapter_id
    left join public.notions confused on confused.id = ns.gap_confused_with
    left join lateral (
      select ge.evidence
      from public.gap_events ge
      where ge.user_id = ns.user_id
        and ge.notion_id = ns.notion_id
        and ge.kind in ('detected', 'nature_changed')
      order by ge.created_at desc, ge.id desc
      limit 1
    ) event on true
    left join lateral (
      select cs.id, cs.anchor
      from public.courses course
      join public.course_sections cs on cs.course_id = course.id
      where course.owner_id = ${userId}::uuid
        and course.module_id = n.module_id
        and course.is_current
        and course.status = 'ready'
        and n.id = any(cs.notion_ids)
      order by cs.position
      limit 1
    ) section on true
    where ns.user_id = ${userId}::uuid
      and n.formation_id = ${formationId}::uuid
      and ns.gap_nature is not null
      and ns.gap_cleared_at is null
      ${natureFilter}
    order by ${NATURE_ORDER}, ns.gap_detected_at desc nulls last, n.label
  `);
}

async function readNextReview(
  tx: DbTx,
  userId: string,
  formationId: string,
  now: Date,
): Promise<string | null> {
  const rows = await tx.execute<NextReviewRow>(sql`
    select min(ns.due_at) as next_review_at
    from public.notion_states ns
    join public.notions n on n.id = ns.notion_id
    where ns.user_id = ${userId}::uuid
      and n.formation_id = ${formationId}::uuid
      and ns.in_review
      and ns.due_at is not null
      and ns.due_at >= ${now.toISOString()}::timestamptz
  `);
  const value = rows[0]?.next_review_at ?? null;
  return value === null ? null : new Date(value).toISOString();
}

function toCard(row: GapRow, formationId: string, now: Date): GapCard {
  const nature = row.nature;
  const section =
    row.section_id === null || row.section_anchor === null
      ? null
      : { sectionId: row.section_id, anchor: row.section_anchor };
  return {
    notionId: row.notion_id,
    notionLabel: row.notion_label,
    nature,
    recommendedAction: RECOMMENDED_ACTION_BY_NATURE[nature],
    confusedWithLabel: row.confused_with_label,
    moduleId: row.module_id,
    modulePosition: row.module_position,
    moduleTitle: row.module_title,
    chapterId: row.chapter_id,
    chapterTitle: row.chapter_title,
    revealedBy: row.revealed_by,
    detectedAt: (row.detected_at === null ? now : new Date(row.detected_at)).toISOString(),
    mastery: row.mastery,
    threshold: row.threshold,
    training: trainingTarget({
      formationId,
      moduleId: row.module_id,
      notionId: row.notion_id,
      nature,
    }),
    course: courseTarget({
      formationId,
      moduleId: row.module_id,
      chapterId: row.chapter_id,
      section,
    }),
  };
}

export interface ListGapsInput {
  formationId: string;
  nature?: GapNature | null;
}

/**
 * ET-3, CL-1, CL-3 — one snapshot of the formation: summary, independent counters, filtered cards
 * and the next review instant, in the learner's IANA zone. A read never writes.
 */
export function listGaps(ctx: ServiceContext, input: ListGapsInput): Promise<Result<GapListDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const query = GapListQuery.safeParse({
      nature: input.nature === null ? undefined : input.nature,
    });
    if (!query.success) {
      throw new AppError('VALIDATION_FAILED', 'Nature de lacune inconnue.', {
        errors: [{ path: 'nature', message: 'Valeur attendue parmi les quatre natures.' }],
      });
    }
    const nature = query.data.nature;
    if (nature !== undefined && !LEARNING_GAP_NATURES.includes(nature)) {
      throw new AppError('VALIDATION_FAILED', 'Nature de lacune inconnue.');
    }
    const now = ctx.clock.now();
    return db.run(async (tx) => {
      const formation = await readFormation(tx, userId, input.formationId);
      const [summary, counts, rows, nextReviewAt] = await Promise.all([
        readSummary(tx, userId, input.formationId),
        readCounts(tx, userId, input.formationId),
        readGapRows(tx, userId, input.formationId, nature),
        readNextReview(tx, userId, input.formationId, now),
      ]);
      return GapListDto.parse({
        formationId: formation.id,
        formationTitle: formation.title,
        nature: nature ?? null,
        summary: {
          openGaps: Math.max(0, summary.open_gaps),
          masteredNotions: Math.max(0, summary.mastered_notions),
          gapModules: summary.gap_modules ?? [],
          masteredModules: summary.mastered_modules ?? [],
        },
        countsByNature: counts,
        items: rows.map((row) => toCard(row, formation.id, now)),
        nextReviewAt,
        timezone: formation.timezone,
        generatedAt: now.toISOString(),
      });
    });
  });
}
