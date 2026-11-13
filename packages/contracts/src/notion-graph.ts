import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';
import { defineRoute } from './define-route';
import { LEARNING_GAP_NATURES } from './learning';

// Contracts of the « Carte des notions » screen (SPEC-616 EF-1 to EF-5, ET-3 to ET-5; BR-CAR-01
// to BR-CAR-05).
//
// The DTO is the exact view model of SCR-14: the four node kinds, the six typed link families,
// the learner's mastery (null for a notion not seen yet) and the open gaps. Every identifier is
// stable so `layoutGraph(graph, seed)` can be replayed across two loads (CA-1), and every field
// comes from a row the learner may read under RLS (ET-3). Private links and another member's
// contributions never enter the DTO: the service filters them before it builds the payload.

export const NOTION_GRAPH_NODE_KINDS = ['formation', 'module', 'notion', 'source'] as const;
export const NotionGraphNodeKind = z.enum(NOTION_GRAPH_NODE_KINDS);
export type NotionGraphNodeKind = z.infer<typeof NotionGraphNodeKind>;

/** BR-CAR-01 — contains, prerequisite, confusion, tutor, source; the formation root has its own. */
export const NOTION_GRAPH_LINK_KINDS = [
  'formation',
  'contains',
  'prerequisite',
  'confusion',
  'tutor',
  'source',
] as const;
export const NotionGraphLinkKind = z.enum(NOTION_GRAPH_LINK_KINDS);
export type NotionGraphLinkKind = z.infer<typeof NotionGraphLinkKind>;

/** BR-CAR-02 — the three mastery states of the colour mode « Par maîtrise ». */
export const NOTION_MASTERY_STATUSES = ['mastered', 'to_consolidate', 'upcoming'] as const;
export const NotionMasteryStatus = z.enum(NOTION_MASTERY_STATUSES);
export type NotionMasteryStatus = z.infer<typeof NotionMasteryStatus>;

/** BR-CAR-02 — the two colour modes of the legend. */
export const NOTION_GRAPH_COLOR_MODES = ['module', 'mastery'] as const;
export const NotionGraphColorMode = z.enum(NOTION_GRAPH_COLOR_MODES);
export type NotionGraphColorMode = z.infer<typeof NotionGraphColorMode>;

export const NotionGapNature = z.enum(LEARNING_GAP_NATURES);
export type NotionGapNature = z.infer<typeof NotionGapNature>;

/**
 * One point of the graph. A notion carries its module, its live course action, its gap action and
 * its training action; a module carries its position and title; a source carries nothing else.
 * `order` is the deterministic display order the layout replays (formation, modules, notions then
 * sources), so an API response cannot change the coordinates by reordering its arrays.
 */
export const NotionGraphNode = z
  .object({
    id: z.string().min(1).max(64),
    kind: NotionGraphNodeKind,
    label: z.string().min(1).max(200),
    /** Position in the deterministic layout sequence. */
    order: z.number().int().min(0),
    moduleId: Uuid.nullable(),
    modulePosition: z.number().int().min(1).nullable(),
    moduleTitle: z.string().min(1).max(160).nullable(),
    chapterPosition: z.number().int().min(1).nullable(),
    notionPosition: z.number().int().min(1).nullable(),
    definition: z.string().max(400).nullable(),
    mastery: z.number().min(0).max(100).nullable(),
    masteryStatus: NotionMasteryStatus.nullable(),
    gapNature: NotionGapNature.nullable(),
    /** Live course section, with the module page as fallback; null for non-notion nodes. */
    courseHref: z.string().min(1).max(2048).nullable(),
    trainingHref: z.string().min(1).max(2048).nullable(),
    gapHref: z.string().min(1).max(2048).nullable(),
  })
  .strict();
export type NotionGraphNode = z.infer<typeof NotionGraphNode>;

/** One edge; the orientation is the stored one (prerequisite: from prepares to). */
export const NotionGraphLink = z
  .object({
    id: z.string().min(1).max(128),
    from: z.string().min(1).max(64),
    to: z.string().min(1).max(64),
    kind: NotionGraphLinkKind,
  })
  .strict();
export type NotionGraphLink = z.infer<typeof NotionGraphLink>;

/** BR-CAR-04 — one row of the « À consolider » list, ordered by ascending mastery. */
export const NotionGraphGap = z
  .object({
    notionId: Uuid,
    label: z.string().min(1).max(120),
    mastery: z.number().min(0).max(100),
    nature: NotionGapNature,
    href: z.string().min(1).max(2048),
  })
  .strict();
export type NotionGraphGap = z.infer<typeof NotionGraphGap>;

/** Header statistics of the screen: notions, relation links, modules, mastered and upcoming. */
export const NotionGraphStats = z
  .object({
    notions: z.number().int().min(0),
    links: z.number().int().min(0),
    modules: z.number().int().min(0),
    mastered: z.number().int().min(0),
    upcoming: z.number().int().min(0),
    openGaps: z.number().int().min(0),
  })
  .strict();
export type NotionGraphStats = z.infer<typeof NotionGraphStats>;

export const NotionGraphDto = z
  .object({
    formationId: Uuid,
    formationTitle: z.string().min(1).max(160),
    timezone: z.string().min(1),
    /** Instant of the read, through the injectable clock (ADR-0047). */
    generatedAt: IsoDateTime,
    nodes: z.array(NotionGraphNode),
    links: z.array(NotionGraphLink),
    gaps: z.array(NotionGraphGap),
    stats: NotionGraphStats,
  })
  .strict();
export type NotionGraphDto = z.infer<typeof NotionGraphDto>;

export const notionGraphParams = z.object({ fid: Uuid });

/** ET-3 — nodes and links visible under RLS, with mastery and no private content. */
export const notionGraph = defineRoute({
  id: 'notionGraph.get',
  method: 'GET',
  path: '/api/v1/formations/:fid/notion-graph',
  auth: 'user',
  params: notionGraphParams,
  output: NotionGraphDto,
  successStatus: 200,
  summary:
    'Graphe des notions d’une formation avec maîtrise, lacunes, apports personnels et liens typés (SPEC-616).',
  errors: ['VALIDATION_FAILED', 'NOT_FOUND', 'UNAUTHENTICATED', 'INTERNAL_ERROR'],
});

export const notionGraphRoutes = { notionGraph } as const;
