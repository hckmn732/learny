import { sql } from 'drizzle-orm';

import {
  NotionGraphDto,
  type NotionGraphGap,
  type NotionGraphLink,
  type NotionGraphNode,
  type NotionGapNature,
  type NotionMasteryStatus,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import type { DbTx } from '@learny/db';

import type { ServiceContext } from '../context';
import { courseTarget, trainingTarget } from '../gaps/links';
import { requireUser, toResult } from '../resources/result';

// Read model of « Carte des notions » (SPEC-616 EF-1 to EF-5, ET-3 to ET-5; BR-CAR-01 to 05).
//
// One transaction reads the formation, its programme, the learner's notion states, the links RLS
// lets them see and their own ready contributions. A formation of another learner is invisible and
// therefore a 404, never an empty graph. Personal links (owner_id not null) and another member's
// resources are filtered by RLS before this service ever sees them (BR-CAR-04, CA-4).
//
// The contribution → notion mapping has no column in the data model: an apport belongs to a
// chapter, so it feeds every notion of that chapter. This is the deterministic choice recorded in
// ADR-0307; the graph never invents a private relation.

interface FormationRow {
  [key: string]: unknown;
  id: string;
  title: string;
  timezone: string;
}

interface ModuleRow {
  [key: string]: unknown;
  id: string;
  position: number;
  title: string;
  threshold: number;
}

interface NotionRow {
  [key: string]: unknown;
  id: string;
  label: string;
  definition: string | null;
  module_id: string;
  chapter_id: string;
  chapter_position: number;
  notion_position: number;
  module_position: number;
  module_title: string;
  threshold: number;
  mastery: number | null;
  gap_nature: NotionGapNature | null;
  gap_cleared_at: string | Date | null;
  section_id: string | null;
  section_anchor: string | null;
}

interface LinkRow {
  [key: string]: unknown;
  id: string;
  from_notion_id: string;
  to_notion_id: string;
  kind: 'prerequisite' | 'confusion' | 'tutor';
}

interface ResourceRow {
  [key: string]: unknown;
  id: string;
  title: string;
  chapter_id: string | null;
  created_at: string | Date;
}

interface Model {
  formation: FormationRow;
  modules: ModuleRow[];
  notions: NotionRow[];
  links: LinkRow[];
  resources: ResourceRow[];
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

async function readModel(tx: DbTx, userId: string, formationId: string): Promise<Model> {
  const formation = await readFormation(tx, userId, formationId);

  const modules = await tx.execute<ModuleRow>(sql`
    select m.id::text as id,
           m.position::int as position,
           m.title,
           m.threshold::int as threshold
    from public.modules m
    where m.formation_id = ${formationId}::uuid
    order by m.position, m.id
  `);

  const notions = await tx.execute<NotionRow>(sql`
    select n.id::text as id,
           n.label,
           n.short_definition as definition,
           n.module_id::text as module_id,
           n.chapter_id::text as chapter_id,
           c.position::int as chapter_position,
           n.position::int as notion_position,
           m.position::int as module_position,
           m.title as module_title,
           m.threshold::int as threshold,
           ns.mastery::float8 as mastery,
           ns.gap_nature::text as gap_nature,
           ns.gap_cleared_at,
           section.id::text as section_id,
           section.anchor as section_anchor
    from public.notions n
    join public.modules m on m.id = n.module_id
    join public.chapters c on c.id = n.chapter_id
    left join public.notion_states ns
      on ns.notion_id = n.id and ns.user_id = ${userId}::uuid
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
    where n.formation_id = ${formationId}::uuid
    order by m.position, c.position, n.position, n.label, n.id
  `);

  // RLS exposes programme links to the owner and active group members, and personal links only to
  // their owner. The service never widens that set.
  const links = await tx.execute<LinkRow>(sql`
    select nl.id::text as id,
           nl.from_notion_id::text as from_notion_id,
           nl.to_notion_id::text as to_notion_id,
           nl.kind::text as kind
    from public.notion_links nl
    where nl.formation_id = ${formationId}::uuid
    order by nl.kind, nl.from_notion_id, nl.to_notion_id, nl.id
  `);

  // Only the learner's own ready contributions, never another member's (ET-3, CL-5).
  const resources = await tx.execute<ResourceRow>(sql`
    select r.id::text as id,
           r.title,
           r.chapter_id::text as chapter_id,
           r.created_at
    from public.resources r
    where r.formation_id = ${formationId}::uuid
      and r.owner_id = ${userId}::uuid
      and r.status = 'ready'
      and r.deleted_at is null
      and r.chapter_id is not null
    order by r.created_at, r.id
  `);

  return { formation, modules, notions, links, resources };
}

function masteryStatus(row: NotionRow, hasOpenGap: boolean): NotionMasteryStatus {
  if (row.mastery === null) return 'upcoming';
  if (hasOpenGap) return 'to_consolidate';
  return row.mastery >= row.threshold ? 'mastered' : 'to_consolidate';
}

function courseHref(formationId: string, notion: NotionRow): string {
  const section =
    notion.section_id === null || notion.section_anchor === null
      ? null
      : { sectionId: notion.section_id, anchor: notion.section_anchor };
  const target = courseTarget({
    formationId,
    moduleId: notion.module_id,
    chapterId: notion.chapter_id,
    section,
  });
  if (target !== null) return target.href;
  return `/formations/${encodeURIComponent(formationId)}/modules/${encodeURIComponent(
    notion.module_id,
  )}/cours`;
}

function gapHref(formationId: string, nature: NotionGapNature): string {
  return `/formations/${encodeURIComponent(formationId)}/lacunes?nature=${encodeURIComponent(
    nature,
  )}`;
}

function notionLinkIds(notionId: string): string {
  return `notion:${notionId}`;
}

function buildNodes(
  formationId: string,
  model: Model,
): { nodes: NotionGraphNode[]; gaps: NotionGraphGap[]; relationLinks: number } {
  const nodes: NotionGraphNode[] = [];
  const gaps: NotionGraphGap[] = [];
  let order = 0;

  nodes.push({
    id: notionLinkIds(formationId),
    kind: 'formation',
    label: model.formation.title,
    order: order++,
    moduleId: null,
    modulePosition: null,
    moduleTitle: null,
    chapterPosition: null,
    notionPosition: null,
    definition: null,
    mastery: null,
    masteryStatus: null,
    gapNature: null,
    courseHref: null,
    trainingHref: null,
    gapHref: null,
  });

  for (const module of model.modules) {
    nodes.push({
      id: notionLinkIds(module.id),
      kind: 'module',
      label: `Module ${String(module.position)} · ${module.title}`,
      order: order++,
      moduleId: module.id,
      modulePosition: module.position,
      moduleTitle: module.title,
      chapterPosition: null,
      notionPosition: null,
      definition: null,
      mastery: null,
      masteryStatus: null,
      gapNature: null,
      courseHref: null,
      trainingHref: null,
      gapHref: null,
    });
  }

  for (const notion of model.notions) {
    const openGap = notion.gap_nature !== null && notion.gap_cleared_at === null;
    const status = masteryStatus(notion, openGap);
    const href = courseHref(formationId, notion);
    const training =
      openGap && notion.gap_nature !== null
        ? trainingTarget({
            formationId,
            moduleId: notion.module_id,
            notionId: notion.id,
            nature: notion.gap_nature,
          }).href
        : `/formations/${encodeURIComponent(formationId)}/quiz-global?cible=${encodeURIComponent(
            notion.id,
          )}`;
    const notionGapHref =
      openGap && notion.gap_nature !== null ? gapHref(formationId, notion.gap_nature) : null;
    nodes.push({
      id: notionLinkIds(notion.id),
      kind: 'notion',
      label: notion.label,
      order: order++,
      moduleId: notion.module_id,
      modulePosition: notion.module_position,
      moduleTitle: notion.module_title,
      chapterPosition: notion.chapter_position,
      notionPosition: notion.notion_position,
      definition: notion.definition,
      mastery: notion.mastery,
      masteryStatus: status,
      gapNature: openGap ? notion.gap_nature : null,
      courseHref: href,
      trainingHref: training,
      gapHref: notionGapHref,
    });
    if (openGap && notion.gap_nature !== null && notion.mastery !== null) {
      gaps.push({
        notionId: notion.id,
        label: notion.label,
        mastery: notion.mastery,
        nature: notion.gap_nature,
        href: notionGapHref ?? gapHref(formationId, notion.gap_nature),
      });
    }
  }

  for (const resource of model.resources) {
    nodes.push({
      id: notionLinkIds(resource.id),
      kind: 'source',
      label: resource.title,
      order: order++,
      moduleId: null,
      modulePosition: null,
      moduleTitle: null,
      chapterPosition: null,
      notionPosition: null,
      definition: null,
      mastery: null,
      masteryStatus: null,
      gapNature: null,
      courseHref: null,
      trainingHref: null,
      gapHref: null,
    });
  }

  const relationLinks = model.links.length;
  return {
    nodes,
    gaps: gaps.sort(
      (left, right) => left.mastery - right.mastery || left.label.localeCompare(right.label, 'fr'),
    ),
    relationLinks,
  };
}

function buildLinks(model: Model): NotionGraphLink[] {
  const links: NotionGraphLink[] = [];
  for (const module of model.modules) {
    links.push({
      id: `formation:${module.id}`,
      from: notionLinkIds(model.formation.id),
      to: notionLinkIds(module.id),
      kind: 'formation',
    });
  }
  for (const notion of model.notions) {
    links.push({
      id: `contains:${notion.id}`,
      from: notionLinkIds(notion.module_id),
      to: notionLinkIds(notion.id),
      kind: 'contains',
    });
  }
  for (const link of model.links) {
    links.push({
      id: `notion-link:${link.id}`,
      from: notionLinkIds(link.from_notion_id),
      to: notionLinkIds(link.to_notion_id),
      kind: link.kind,
    });
  }

  const notionByChapter = new Map<string, string[]>();
  for (const notion of model.notions) {
    const list = notionByChapter.get(notion.chapter_id) ?? [];
    list.push(notion.id);
    notionByChapter.set(notion.chapter_id, list);
  }
  for (const resource of model.resources) {
    const fed =
      resource.chapter_id === null ? [] : (notionByChapter.get(resource.chapter_id) ?? []);
    for (const notionId of fed) {
      links.push({
        id: `source:${resource.id}:${notionId}`,
        from: notionLinkIds(resource.id),
        to: notionLinkIds(notionId),
        kind: 'source',
      });
    }
  }

  return links;
}

export interface GetNotionGraphInput {
  formationId: string;
}

/**
 * ET-3 — read the graph of one formation under the learner's RLS client. The colour mode is a
 * pure client concern: both modes read the same mastery and module fields, so no persisted state
 * changes when the legend switches.
 */
export async function getNotionGraph(
  ctx: ServiceContext,
  input: GetNotionGraphInput,
): Promise<Result<NotionGraphDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run(async (tx) => {
      const model = await readModel(tx, userId, input.formationId);
      const { nodes, gaps, relationLinks } = buildNodes(input.formationId, model);
      const links = buildLinks(model);
      const mastered = nodes.filter(
        (node) => node.kind === 'notion' && node.masteryStatus === 'mastered',
      ).length;
      const upcoming = nodes.filter(
        (node) => node.kind === 'notion' && node.masteryStatus === 'upcoming',
      ).length;
      return NotionGraphDto.parse({
        formationId: model.formation.id,
        formationTitle: model.formation.title,
        timezone: model.formation.timezone,
        generatedAt: ctx.clock.now().toISOString(),
        nodes,
        links,
        gaps,
        stats: {
          notions: nodes.filter((node) => node.kind === 'notion').length,
          links: relationLinks,
          modules: model.modules.length,
          mastered,
          upcoming,
          openGaps: gaps.length,
        },
      });
    });
  });
}
