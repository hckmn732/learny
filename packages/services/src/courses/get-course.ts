import {
  CourseSection,
  CourseSummaryView,
  ModuleCourseScreen,
  type CourseCitation,
  type CourseSuggestion,
  type CourseView,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql, type DbTx } from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { coursePercent, estimateReadingMinutes, readProgressByChapter } from './progress';

// SPEC-608 EF-1 to EF-5, ET-1, BR-COU-03, BR-COU-10, BR-COU-11 — read model of SCR-07.
//
// Everything runs under the caller's RLS client with an explicit owner filter, so a module or course
// of another learner is a plain 404. The page receives the current ready version of the module, the
// selected chapter, its typed sections with their verified citations and, for a base course, the
// pending resource suggestions. A deleted source keeps its label with `deleted: true` (ADR-0039).

interface ModuleRow extends Record<string, unknown> {
  formation_id: string;
  formation_title: string;
  module_id: string;
  module_title: string;
  module_position: number;
  modules_total: number;
  threshold: number;
}

interface ChapterRow extends Record<string, unknown> {
  id: string;
  position: number;
  title: string;
}

interface CourseRow extends Record<string, unknown> {
  id: string;
  version: number;
  status: string;
  model: string | null;
  error: string | null;
  created_at: Date | string;
}

interface SectionRow extends Record<string, unknown> {
  id: string;
  chapter_id: string;
  position: number;
  kind: string;
  anchor: string;
  title: string | null;
  content_md: string | null;
  data: unknown;
  origin: string;
  notion_ids: unknown;
  version: number;
  reported: boolean;
}

interface CitationRow extends Record<string, unknown> {
  id: string;
  section_id: string;
  chunk_id: string | null;
  resource_id: string | null;
  quote: string | null;
  location: unknown;
  label: string;
  media_kind: string;
  deleted: boolean;
}

interface SuggestionRow extends Record<string, unknown> {
  id: string;
  title: string;
  url: string;
  reason: string | null;
}

function isoOf(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  }
  return typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value))
    return value.filter((entry): entry is string => typeof entry === 'string');
  if (typeof value === 'string') {
    return value
      .replace(/^\{|\}$/g, '')
      .split(',')
      .map((entry) => entry.trim().replace(/^"|"$/g, ''))
      .filter((entry) => entry !== '');
  }
  return [];
}

function sectionText(section: SectionRow): string {
  const parts = [section.content_md ?? '', section.title ?? ''];
  const data = asObject(section.data);
  if (data !== null) {
    if (typeof data.question === 'string') {
      parts.push(data.question);
      if (typeof data.answer === 'string') parts.push(data.answer);
    }
    if (Array.isArray(data.points)) {
      parts.push(data.points.filter((point) => typeof point === 'string').join(' '));
    }
    if (typeof data.mnemonic === 'string') parts.push(data.mnemonic);
    for (const side of ['left', 'right']) {
      const value = asObject(data[side]);
      if (value !== null) {
        for (const key of ['title', 'body', 'example']) {
          const text = value[key];
          if (typeof text === 'string') parts.push(text);
        }
      }
    }
  }
  return parts.join(' ');
}

function readingMinutesOf(sections: readonly SectionRow[]): number {
  const text = sections.map(sectionText).join(' ');
  const words = text.trim() === '' ? 0 : text.trim().split(/\s+/u).length;
  return estimateReadingMinutes(words);
}

function citationOf(row: CitationRow): CourseCitation {
  return {
    id: row.id,
    chunkId: row.chunk_id,
    resourceId: row.resource_id,
    label: row.label,
    quote: row.quote,
    location: asObject(row.location),
    mediaKind: row.media_kind as CourseCitation['mediaKind'],
    deleted: row.deleted,
  };
}

function sectionOf(row: SectionRow, citations: readonly CourseCitation[]): CourseSection {
  return CourseSection.parse({
    id: row.id,
    kind: row.kind,
    anchor: row.anchor,
    title: row.title,
    contentMd: row.content_md,
    data: asObject(row.data),
    origin: row.origin === 'resource' ? 'resource' : 'tutor',
    notionIds: asStringArray(row.notion_ids),
    citations,
    version: row.version,
    reported: row.reported,
  });
}

interface SummaryRow extends Record<string, unknown> {
  id: string;
  chapter_id: string;
  course_id: string;
  text: string;
  feedback: unknown;
  created_at: Date | string;
}

function summaryOf(row: SummaryRow | undefined): CourseSummaryView | null {
  if (row === undefined) return null;
  const parsed = CourseSummaryView.shape.feedback.safeParse(row.feedback);
  const feedback = parsed.success ? parsed.data : null;
  return CourseSummaryView.parse({
    id: row.id,
    chapterId: row.chapter_id,
    courseId: row.course_id,
    text: row.text,
    feedback,
    status: feedback === null ? 'deferred' : 'corrected',
    createdAt: isoOf(row.created_at),
  });
}

async function readCitations(tx: DbTx, sectionIds: readonly string[]): Promise<CitationRow[]> {
  if (sectionIds.length === 0) return [];
  return tx.execute<CitationRow>(sql`
    select
      ci.id::text as id,
      ci.section_id::text as section_id,
      ci.chunk_id::text as chunk_id,
      ci.resource_id::text as resource_id,
      ci.quote,
      ci.location,
      ci.label,
      ci.media_kind::text as media_kind,
      (
        ci.chunk_id is null
        or not exists (
          select 1
          from public.resource_chunks c
          join public.resources r on r.id = c.resource_id
          where c.id = ci.chunk_id
            and c.owner_id = ci.owner_id
            and r.status = 'ready'
            and r.deleted_at is null
        )
      ) as deleted
    from public.citations ci
    where ci.section_id = any(${`{${sectionIds.join(',')}}`}::uuid[])
    order by ci.created_at asc, ci.id asc
  `);
}

export function getModuleCourse(
  ctx: ServiceContext,
  moduleId: string,
  chapterId?: string,
): Promise<Result<ModuleCourseScreen>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const screen = await db.run(async (tx): Promise<ModuleCourseScreen> => {
      const modules = await tx.execute<ModuleRow>(sql`
        select
          f.id::text as formation_id,
          f.title as formation_title,
          m.id::text as module_id,
          m.title as module_title,
          m.position as module_position,
          (select count(*)::int from public.modules sibling where sibling.formation_id = f.id)
            as modules_total,
          f.default_threshold as threshold
        from public.modules m
        join public.formations f on f.id = m.formation_id
        where m.id = ${moduleId}::uuid
        limit 1
      `);
      const module = modules[0];
      if (module === undefined) throw new AppError('NOT_FOUND', 'Module introuvable.');

      const chapters = await tx.execute<ChapterRow>(sql`
        select id::text as id, position, title
        from public.chapters
        where module_id = ${moduleId}::uuid
        order by position asc, id asc
      `);
      if (chapters.length === 0) throw new AppError('NOT_FOUND', 'Aucun chapitre dans ce module.');

      const selected = chapters.find((chapter) => chapter.id === chapterId) ?? chapters[0];
      if (selected === undefined) throw new AppError('NOT_FOUND', 'Chapitre introuvable.');

      const courses = await tx.execute<CourseRow>(sql`
        select id::text as id, version, status::text as status, model, error, created_at
        from public.courses
        where owner_id = ${userId}::uuid
          and module_id = ${moduleId}::uuid
          and is_current
        order by version desc
        limit 1
      `);
      const current = courses[0];

      const latest = await tx.execute<CourseRow>(sql`
        select id::text as id, version, status::text as status, model, error, created_at
        from public.courses
        where owner_id = ${userId}::uuid and module_id = ${moduleId}::uuid
        order by version desc
        limit 1
      `);
      const last = latest[0];

      const generation = {
        status:
          current?.status === 'ready'
            ? ('ready' as const)
            : last?.status === 'generating'
              ? ('generating' as const)
              : last?.status === 'failed'
                ? ('failed' as const)
                : ('none' as const),
        version: last?.version ?? null,
        error: last?.status === 'failed' ? last.error : null,
      };

      const counts =
        current === undefined
          ? []
          : await tx.execute<{ chapter_id: string; total: number }>(sql`
              select chapter_id::text as chapter_id, count(*)::int as total
              from public.course_sections
              where course_id = ${current.id}::uuid
              group by chapter_id
            `);
      const countByChapter = new Map(counts.map((row) => [row.chapter_id, row.total]));
      const persisted = current === undefined ? new Map<string, number>() : await readProgressByChapter(tx, userId, current.id);
      const chapterSummaries = chapters.map((chapter) => ({
        id: chapter.id,
        position: chapter.position,
        title: chapter.title,
        hasCourse: (countByChapter.get(chapter.id) ?? 0) > 0,
        percent: persisted.get(chapter.id) ?? 0,
      }));

      if (current === undefined || current.status !== 'ready') {
        return {
          formation: { id: module.formation_id, title: module.formation_title },
          module: {
            id: module.module_id,
            position: module.module_position,
            positionTotal: module.modules_total,
            title: module.module_title,
          },
          chapters: chapterSummaries,
          selectedChapterId: selected.id,
          course: null,
          generation,
        };
      }

      const sectionRows = await tx.execute<SectionRow>(sql`
        select
          id::text as id,
          chapter_id::text as chapter_id,
          position,
          kind::text as kind,
          anchor,
          title,
          content_md,
          data,
          origin::text as origin,
          notion_ids,
          version,
          reported
        from public.course_sections
        where course_id = ${current.id}::uuid
          and chapter_id = ${selected.id}::uuid
        order by position asc, id asc
      `);
      const citations = await readCitations(
        tx,
        sectionRows.map((row) => row.id),
      );
      const bySection = new Map<string, CourseCitation[]>();
      for (const citation of citations) {
        const list = bySection.get(citation.section_id) ?? [];
        list.push(citationOf(citation));
        bySection.set(citation.section_id, list);
      }
      const sections = sectionRows.map((row) => sectionOf(row, bySection.get(row.id) ?? []));

      const resourceRows = await tx.execute<{ total: number }>(sql`
        select count(distinct r.id)::int as total
        from public.resources r
        where r.owner_id = ${userId}::uuid
          and r.chapter_id = ${selected.id}::uuid
          and r.origin = 'learner'
          and r.status = 'ready'
          and r.deleted_at is null
      `);
      const resourceCount = resourceRows[0]?.total ?? 0;

      const suggestions =
        resourceCount > 0
          ? []
          : await tx.execute<SuggestionRow>(sql`
              select
                r.id::text as id,
                r.title,
                r.url,
                r.metadata ->> 'suggestionReason' as reason
              from public.resources r
              where r.owner_id = ${userId}::uuid
                and r.chapter_id = ${selected.id}::uuid
                and r.origin = 'tutor_suggestion'
                and r.suggestion_status = 'pending'
                and r.deleted_at is null
                and r.url is not null
              order by r.created_at asc, r.id asc
            `);

      const summaries = await tx.execute<SummaryRow>(sql`
        select
          id::text as id,
          chapter_id::text as chapter_id,
          course_id::text as course_id,
          text,
          feedback,
          created_at
        from public.chapter_summaries
        where user_id = ${userId}::uuid
          and chapter_id = ${selected.id}::uuid
          and course_id = ${current.id}::uuid
        order by created_at desc, id desc
        limit 1
      `);

      const selectedIndex = chapters.findIndex((chapter) => chapter.id === selected.id);
      const chapterPercent = persisted.get(selected.id) ?? 0;
      const course: CourseView = {
        id: current.id,
        version: current.version,
        status: 'ready',
        generatedAt: isoOf(current.created_at),
        model: current.model,
        readingMinutes: readingMinutesOf(sectionRows),
        resourceCount,
        baseCourse: resourceCount === 0,
        chapter: {
          id: selected.id,
          position: selected.position,
          title: selected.title,
          hasCourse: sections.length > 0,
          percent: chapterPercent,
        },
        previousChapterId: chapters[selectedIndex - 1]?.id ?? null,
        nextChapterId: chapters[selectedIndex + 1]?.id ?? null,
        sections,
        suggestions: suggestions.map((row): CourseSuggestion => ({
          id: row.id,
          title: row.title,
          url: row.url,
          reason: row.reason ?? 'Ressource suggérée par le tuteur.',
        })),
        progress: {
          chapterPercent,
          coursePercent: coursePercent(
            chapterSummaries
              .filter((chapter) => chapter.hasCourse)
              .map((chapter) => chapter.percent),
          ),
          updatedAt: null,
        },
        summary: summaryOf(summaries[0]),
        quiz: {
          threshold: module.threshold,
          href: `/formations/${encodeURIComponent(module.formation_id)}/modules/${encodeURIComponent(module.module_id)}`,
        },
      };

      return {
        formation: { id: module.formation_id, title: module.formation_title },
        module: {
          id: module.module_id,
          position: module.module_position,
          positionTotal: module.modules_total,
          title: module.module_title,
        },
        chapters: chapterSummaries,
        selectedChapterId: selected.id,
        course,
        generation,
      };
    });
    return ModuleCourseScreen.parse(screen);
  });
}
