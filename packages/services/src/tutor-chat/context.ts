import type { ChatContextInput, ContextItemDto, ContextKey, TutorProfile } from '@learny/contracts';
import { sql } from '@learny/db';
import { escapeDocumentAttribute, escapeDocumentText } from '@learny/ingestion';

import type { ServiceContext } from '../context';
import { requireUser } from '../resources/result';

import { sourceLabel, type SourceCandidate } from './sources';
import { confusionOf } from './starters';

// SPEC-610 ET-4, BR-TUT-02, ADR-0178 — the server alone builds the context transmitted to the
// tutor. The client chooses included keys and the selected passage; the values are re-read under
// the caller's RLS client and only included keys reach the model. At most six SQL queries per
// build; the resource passages keep the 4 000-token budget of `read_resources` (ai.md §3).

export const CONTEXT_LABELS: Record<ContextKey, string> = {
  formation: 'Formation',
  chapter: 'Cours en lecture',
  passage: 'Passage',
  resources: 'Vos apports',
  gap: 'Lacune suivie',
  profile: 'Votre profil',
};

const FORMATION_OBJECTIVES: Record<string, string> = {
  operational: 'être opérationnel',
  exam: 'préparer la certification',
  dialogue: 'pouvoir en parler',
  project: 'conduire un projet',
};

const GAP_NATURES: Record<string, string> = {
  forgetting: 's’efface avec le temps',
  confusion: 'confondue avec une notion proche',
  misunderstanding: 'comprise de travers',
  application: 'pas encore appliquée',
};

export const PASSAGE_MAX = 1_000;
export const PASSAGE_PREVIEW = 160;
export const RESOURCE_TOKEN_BUDGET = 4_000;
export const CHAPTER_TEXT_MAX = 6_000;

export interface ContextRecords {
  formation: {
    id: string;
    title: string;
    objectives: string[];
    cadrageProfile: Record<string, unknown>;
  };
  module: { id: string; position: number; title: string };
  chapter: { id: string; position: number; title: string };
  course: { id: string; version: number };
  percent: number;
  profile: { tone: TutorProfile['tone']; courseLanguage: TutorProfile['courseLanguage'] };
  resources: { id: string; title: string; kind: string }[];
  gap: {
    notionId: string;
    label: string;
    nature: string;
    confusedWith: string | null;
    mastery: number;
  } | null;
  sections: {
    id: string;
    kind: string;
    anchor: string;
    title: string | null;
    contentMd: string | null;
    notionIds: string[];
  }[];
  notions: { id: string; label: string }[];
  chunks: {
    chunkId: string;
    resourceId: string;
    title: string;
    kind: string;
    text: string;
    location: Record<string, unknown>;
  }[];
  passage?: { text: string; sectionId?: string };
}

export interface BuiltContext {
  items: ContextItemDto[];
  includedKeys: ContextKey[];
  promptBlock: string;
  resourcesBlock: string;
  sources: SourceCandidate[];
  gapFirst: boolean;
  notionIds: string[];
  profile: TutorProfile;
  formationId: string;
  chapterId: string;
  chapterTitle: string;
  chapterPosition: number;
  courseId: string;
  primaryResourceTitle: string | null;
  promptVersion: number;
  passageLabel: string | null;
  passagePreview: string | null;
  resourceTitles: string[];
  notionLabels: Record<string, string>;
  gapNotionId: string | null;
  gapLabel: string | null;
  gapNatureText: string | null;
  confusion: { left: string; right: string } | null;
}

function lowerInitial(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}

function objectiveText(objectives: readonly string[]): string {
  return objectives.map((objective) => FORMATION_OBJECTIVES[objective] ?? objective).join(' et ');
}

function sourceText(profile: Record<string, unknown>): string | null {
  const starting = profile.starting_point;
  if (starting === null || typeof starting !== 'object') return null;
  const value = (starting as { value?: unknown }).value;
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function passageLabel(sectionId: string | undefined, records: ContextRecords): string {
  if (sectionId === undefined) return 'Passage sélectionné';
  const section = records.sections.find((entry) => entry.id === sectionId);
  if (section === undefined) return 'Passage sélectionné';
  if (section.kind === 'dont_confuse') return 'Ne pas confondre';
  if (section.kind === 'tutor_completed') return 'Complété par le tuteur';
  return section.title ?? 'Passage sélectionné';
}

function normalizePassage(
  input: ChatContextInput,
): { text: string; sectionId?: string } | undefined {
  if (input.passage === undefined) return undefined;
  const text = input.passage.text.replace(/\s+/g, ' ').trim().slice(0, PASSAGE_MAX);
  if (text.length < 12) return undefined;
  return {
    text,
    ...(input.passage.sectionId === undefined ? {} : { sectionId: input.passage.sectionId }),
  };
}

function resourceValue(resources: ContextRecords['resources']): string | null {
  if (resources.length === 0) return 'Aucun apport : le tuteur s’appuie sur le cours';
  return resources.map((resource) => lowerInitial(resource.title)).join(', ');
}

function gapValue(gap: NonNullable<ContextRecords['gap']>): string {
  const nature =
    gap.confusedWith === null
      ? (GAP_NATURES[gap.nature] ?? gap.nature)
      : `confondue avec ${gap.confusedWith}`;
  return `${gap.label} · ${nature} · maîtrise ${String(gap.mastery)} %`;
}

function chapterValue(records: ContextRecords): string {
  return `Module ${String(records.module.position)} · Chapitre ${String(records.chapter.position)} · ${records.chapter.title} · ${String(records.percent)} % lu`;
}

function chapterText(records: ContextRecords): string {
  const parts = records.sections
    .filter(
      (section) =>
        section.kind === 'text' ||
        section.kind === 'tutor_completed' ||
        section.kind === 'dont_confuse',
    )
    .map((section) => {
      const body = section.contentMd ?? '';
      return body === '' ? (section.title ?? '') : body;
    })
    .filter((part) => part !== '');
  return parts.join('\n\n').slice(0, CHAPTER_TEXT_MAX);
}

function resourcesBlock(records: ContextRecords): {
  block: string;
  blockTokens: number;
  included: SourceCandidate[];
} {
  let tokens = 0;
  const docs: string[] = [];
  const included: SourceCandidate[] = [];
  for (const chunk of records.chunks) {
    const text = chunk.text.length > 8_000 ? `${chunk.text.slice(0, 8_000)}…` : chunk.text;
    const cost = Math.ceil(text.length / 4);
    if (tokens + cost > RESOURCE_TOKEN_BUDGET) break;
    tokens += cost;
    docs.push(
      `<document source="${escapeDocumentAttribute(sourceLabel(chunk))}" chunk="${escapeDocumentAttribute(chunk.chunkId)}">${escapeDocumentText(text)}</document>`,
    );
    included.push({
      chunkId: chunk.chunkId,
      resourceId: chunk.resourceId,
      title: chunk.title,
      kind: chunk.kind,
      location: chunk.location,
    });
  }
  return { block: docs.join('\n'), blockTokens: tokens, included };
}

function mentions(question: string, gap: NonNullable<ContextRecords['gap']>): boolean {
  const haystack = question.toLowerCase();
  const needles = [gap.label, gap.confusedWith ?? '']
    .map((value) => value.toLowerCase().replace(/[’']/g, ''))
    .filter((value) => value.length >= 4);
  const normalized = haystack.replace(/[’']/g, '');
  return needles.some((needle) => normalized.includes(needle));
}

/** Pure assembly used by `buildContext` and by the unit tests (CA-2). */
export function assembleContext(
  records: ContextRecords,
  input: ChatContextInput,
  question: string,
): BuiltContext {
  const passage = normalizePassage(input);
  const include = input.include;
  const present: ContextKey[] = ['formation', 'chapter'];
  if (passage !== undefined) present.push('passage');
  present.push('resources');
  if (records.gap !== null) present.push('gap');
  present.push('profile');

  const includedKeys = present.filter((key) => include[key] !== false);

  const values: Partial<Record<ContextKey, string>> = {
    formation: `${records.formation.title} · ${objectiveText(records.formation.objectives)}`,
    chapter: chapterValue(records),
    ...(passage === undefined ? {} : { passage: `« ${passage.text} »` }),
    ...(resourceValue(records.resources) === null
      ? {}
      : { resources: resourceValue(records.resources) as string }),
    ...(records.gap === null ? {} : { gap: gapValue(records.gap) }),
    ...(sourceText(records.formation.cadrageProfile) === null
      ? {}
      : { profile: sourceText(records.formation.cadrageProfile) as string }),
  };

  const items: ContextItemDto[] = present.map((key) => ({
    key,
    label: CONTEXT_LABELS[key],
    value: values[key] ?? '',
    included: include[key] !== false,
  }));

  const resources = includedKeys.includes('resources')
    ? resourcesBlock(records)
    : { block: '', blockTokens: 0, included: [] };

  const blocks: string[] = [];
  if (includedKeys.includes('formation')) {
    blocks.push(`<formation>${escapeDocumentText(values.formation ?? '')}</formation>`);
  }
  if (includedKeys.includes('chapter')) {
    blocks.push(`<reading>${escapeDocumentText(values.chapter ?? '')}</reading>`);
    const text = chapterText(records);
    if (text !== '') blocks.push(`<course>${escapeDocumentText(text)}</course>`);
  }
  if (includedKeys.includes('passage') && passage !== undefined) {
    blocks.push(
      `<document source="selection"${passage.sectionId === undefined ? '' : ` section="${escapeDocumentAttribute(passage.sectionId)}"`}>${escapeDocumentText(passage.text)}</document>`,
    );
  }
  if (resources.block !== '') blocks.push(resources.block);
  if (includedKeys.includes('gap') && records.gap !== null) {
    blocks.push(`<gap>${escapeDocumentText(gapValue(records.gap))}</gap>`);
  }
  if (includedKeys.includes('profile') && values.profile !== undefined) {
    blocks.push(`<profile>${escapeDocumentText(values.profile)}</profile>`);
  }

  const notionCounts = new Map<string, number>();
  for (const section of records.sections)
    for (const id of section.notionIds) notionCounts.set(id, (notionCounts.get(id) ?? 0) + 1);
  const notionIds = [...notionCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([id]) => id);
  const passageSection =
    passage?.sectionId === undefined
      ? undefined
      : records.sections.find((section) => section.id === passage.sectionId);
  const eventNotionIds = [...new Set([...(passageSection?.notionIds ?? []), ...notionIds])].slice(
    0,
    3,
  );

  return {
    items,
    includedKeys,
    promptBlock: `<context>\n${blocks.join('\n')}\n</context>`,
    resourcesBlock: resources.block,
    sources: resources.included,
    gapFirst:
      includedKeys.includes('gap') && records.gap !== null && mentions(question, records.gap),
    notionIds: eventNotionIds,
    profile: records.profile,
    formationId: records.formation.id,
    chapterId: records.chapter.id,
    chapterTitle: records.chapter.title,
    chapterPosition: records.chapter.position,
    courseId: records.course.id,
    primaryResourceTitle: records.resources[0]?.title ?? null,
    promptVersion: 1,
    passageLabel: passage === undefined ? null : passageLabel(passage.sectionId, records),
    passagePreview:
      passage === undefined
        ? null
        : passage.text.length > PASSAGE_PREVIEW
          ? `${passage.text.slice(0, PASSAGE_PREVIEW - 2)}…`
          : passage.text,
    resourceTitles: records.resources.map((resource) => resource.title),
    notionLabels: Object.fromEntries(records.notions.map((notion) => [notion.id, notion.label])),
    gapNotionId: records.gap?.notionId ?? null,
    gapLabel: records.gap?.label ?? null,
    gapNatureText:
      records.gap === null
        ? null
        : records.gap.confusedWith === null
          ? (GAP_NATURES[records.gap.nature] ?? records.gap.nature)
          : `se confond encore avec ${records.gap.confusedWith}`,
    confusion: confusionOf(records.sections),
  };
}

interface MetaRow extends Record<string, unknown> {
  formation_id: string;
  formation_title: string;
  objectives: string[] | string;
  cadrage_profile: unknown;
  module_id: string;
  module_position: number;
  module_title: string;
  chapter_id: string;
  chapter_position: number;
  chapter_title: string;
  course_id: string;
  course_version: number;
  percent: number;
  tutor_tone: TutorProfile['tone'];
  course_language: TutorProfile['courseLanguage'];
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || value === undefined) return {};
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  }
  return typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((entry): entry is string => typeof entry === 'string');
  if (typeof value === 'string')
    return value
      .replace(/^\{|\}$/g, '')
      .split(',')
      .filter((entry) => entry !== '');
  return [];
}

function locationOf(value: unknown): Record<string, unknown> {
  return asRecord(value);
}

/** ET-4 — reads under RLS and assembles the context; `conversation` carries the course link. */
export async function buildContext(
  ctx: ServiceContext,
  conversation: { id: string; courseId: string; chapterId: string },
  input: ChatContextInput,
  question: string,
): Promise<BuiltContext> {
  const { userId, db } = requireUser(ctx);
  const rows = await db.run(async (tx) => {
    const meta = await tx.execute<MetaRow>(sql`
      select
        f.id::text as formation_id,
        f.title as formation_title,
        coalesce(f.objectives, '{}'::public.formation_objective[])::text[] as objectives,
        f.cadrage_profile,
        m.id::text as module_id,
        m.position as module_position,
        m.title as module_title,
        ch.id::text as chapter_id,
        ch.position as chapter_position,
        ch.title as chapter_title,
        c.id::text as course_id,
        c.version as course_version,
        coalesce(rp.percent, 0)::int as percent,
        p.tutor_tone::text as tutor_tone,
        p.course_language::text as course_language
      from public.tutor_conversations conv
      join public.courses c on c.id = conv.course_id
      join public.formations f on f.id = c.formation_id
      join public.modules m on m.id = c.module_id
      join public.chapters ch on ch.id = ${conversation.chapterId}::uuid and ch.module_id = m.id
      join public.profiles p on p.id = conv.user_id
      left join public.reading_progress rp
        on rp.course_id = c.id and rp.chapter_id = ch.id and rp.user_id = p.id
      where conv.id = ${conversation.id}::uuid
        and conv.user_id = ${userId}::uuid
      limit 1
    `);
    const head = meta[0];
    if (head === undefined) return null;
    const resources = await tx.execute<{ id: string; title: string; kind: string }>(sql`
      select r.id::text as id, r.title, r.kind::text as kind
      from public.resources r
      where r.owner_id = ${userId}::uuid and r.formation_id = ${head.formation_id}::uuid
        and r.deleted_at is null and r.status = 'ready'
        and exists (
          select 1 from public.chapters ch
          where ch.id = r.chapter_id and ch.module_id = ${head.module_id}::uuid
        )
      order by r.created_at, r.id
    `);
    const gap = await tx.execute<{
      notion_id: string;
      label: string;
      nature: string;
      mastery: string;
      confused_with: string | null;
    }>(sql`
      select ns.notion_id::text as notion_id, n.label, ns.gap_nature::text as nature,
        ns.mastery::text as mastery, other.label as confused_with
      from public.notion_states ns
      join public.notions n on n.id = ns.notion_id
      left join public.notions other on other.id = ns.gap_confused_with
      where ns.user_id = ${userId}::uuid and ns.gap_nature is not null and ns.gap_cleared_at is null
        and n.chapter_id = ${head.chapter_id}::uuid
      order by ns.mastery asc, ns.notion_id
      limit 1
    `);
    const sections = await tx.execute<{
      id: string;
      kind: string;
      anchor: string;
      title: string | null;
      content_md: string | null;
      data: unknown;
      notion_ids: unknown;
    }>(sql`
      select s.id::text as id, s.kind::text as kind, s.anchor, s.title, s.content_md, s.data, s.notion_ids
      from public.course_sections s
      where s.course_id = ${head.course_id}::uuid and s.chapter_id = ${head.chapter_id}::uuid
      order by s.position, s.id
    `);
    const notions = await tx.execute<{ id: string; label: string }>(sql`
      select distinct n.id::text as id, n.label
      from public.notions n
      where n.module_id = ${head.module_id}::uuid
      order by n.label
    `);
    const chunks = await tx.execute<{
      chunk_id: string;
      resource_id: string;
      title: string;
      kind: string;
      text: string;
      location: unknown;
    }>(sql`
      select c.id::text as chunk_id, c.resource_id::text as resource_id, r.title,
        r.kind::text as kind, c.text, c.location
      from public.resource_chunks c
      join public.resources r on r.id = c.resource_id
      where r.owner_id = ${userId}::uuid and r.formation_id = ${head.formation_id}::uuid
        and r.deleted_at is null and r.status = 'ready'
        and exists (
          select 1 from public.chapters ch
          where ch.id = r.chapter_id and ch.module_id = ${head.module_id}::uuid
        )
      order by c.position, c.id
      limit 24
    `);
    return { head, resources, gap: gap[0] ?? null, sections, notions, chunks };
  });
  if (rows === null) throw new Error('conversation introuvable');
  const head = rows.head;
  const passage = normalizePassage(input);
  const records: ContextRecords = {
    formation: {
      id: head.formation_id,
      title: head.formation_title,
      objectives: asStringArray(head.objectives),
      cadrageProfile: asRecord(head.cadrage_profile),
    },
    module: { id: head.module_id, position: head.module_position, title: head.module_title },
    chapter: { id: head.chapter_id, position: head.chapter_position, title: head.chapter_title },
    course: { id: head.course_id, version: head.course_version },
    percent: head.percent,
    profile: { tone: head.tutor_tone, courseLanguage: head.course_language },
    resources: rows.resources,
    gap:
      rows.gap === null
        ? null
        : {
            notionId: rows.gap.notion_id,
            label: rows.gap.label,
            nature: rows.gap.nature,
            confusedWith: rows.gap.confused_with,
            mastery: Math.round(Number(rows.gap.mastery)),
          },
    sections: rows.sections.map((section) => ({
      id: section.id,
      kind: section.kind,
      anchor: section.anchor,
      title: section.title,
      contentMd: section.content_md,
      data: asRecord(section.data),
      notionIds: asStringArray(section.notion_ids),
    })),
    notions: rows.notions,
    chunks: rows.chunks.map((chunk) => ({
      chunkId: chunk.chunk_id,
      resourceId: chunk.resource_id,
      title: chunk.title,
      kind: chunk.kind,
      text: chunk.text,
      location: locationOf(chunk.location),
    })),
    ...(passage === undefined ? {} : { passage }),
  };
  return assembleContext(records, input, question);
}
