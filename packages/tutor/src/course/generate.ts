import {
  CourseDraftSchema,
  RETRIEVAL_TOKEN_BUDGETS,
  type CourseChapterDraft,
  type CourseDraft,
  type CourseSectionDraft,
  type TutorDocument,
  type TutorProfile,
} from '@learny/contracts';
import { AppError, isAppError, type Clock, type LearnyLogger } from '@learny/core';
import { sql, type Db, type DbTx } from '@learny/db';
import { formatDocumentChunk } from '@learny/ingestion';
import { canonicalizeUrl, estimateTokens, isPublicHttpUrl } from '@learny/llm';

import {
  citationFailureSummary,
  validateCourseCitations,
  type KnownChunk,
  type ResolvedCitation,
} from './citations';
import { runCourseChapter } from './run';

// Pipeline of the course generation (SPEC-608 EF-1 to EF-5, ET-2 to ET-5, CL-1 to CL-4).
//
// The caller supplies a user-scoped store: every read and write runs under Row Level Security and
// the explicit owner filters repeat the rule. The model calls run outside any transaction; the
// whole course is validated before a single transaction inserts the new version, its sections,
// citations, suggestions and personal links. A replay of the same generation key returns the
// version created by the first run. Events are emitted only after the commit.

export interface CourseGenerationEvents {
  generated(input: {
    userId: string;
    courseId: string;
    moduleId: string;
    version: number;
    formationId: string;
  }): Promise<void>;
  notificationRequested(input: {
    userId: string;
    type: 'course_ready' | 'ai_task_failed';
    data: Record<string, unknown>;
    formationId: string | null;
    dedupeKey: string;
  }): Promise<void>;
}

export interface CourseGenerationDeps {
  /** Test/demo seam: force one simulated scenario for every chapter. */
  scenario?: string;
  /** Test/demo seam: scenario per chapter (e.g. one sourced, one base course). */
  scenarioForChapter?: (chapterId: string) => string | undefined;
}

export interface CourseGenerationContext {
  userId: string;
  requestId: string;
  store: { run<T>(fn: (tx: DbTx) => Promise<T>): Promise<T> };
  llmDb: Db;
  clock: Clock;
  logger: LearnyLogger;
  moduleId: string;
  /** Deterministic key of the request: a replay never writes a second version. */
  generationKey: string;
  events: CourseGenerationEvents;
  deps?: CourseGenerationDeps;
}

export interface CourseGenerationResult {
  courseId: string;
  moduleId: string;
  version: number;
  status: 'ready' | 'failed';
  created: boolean;
}

interface ModuleContextRow extends Record<string, unknown> {
  formation_id: string;
  formation_title: string;
  module_id: string;
  module_title: string;
  module_position: number;
  tone: string;
  course_language: string;
}

interface ChapterRow extends Record<string, unknown> {
  id: string;
  position: number;
  title: string;
}

interface NotionRow extends Record<string, unknown> {
  id: string;
  chapter_id: string;
  label: string;
  short_definition: string | null;
}

interface PassageRow extends Record<string, unknown> {
  chunk_id: string;
  resource_id: string;
  chapter_id: string;
  text: string;
  location: unknown;
  title: string;
  kind: string;
  status: string;
  deleted_at: Date | null;
  mime: string | null;
}

interface ExistingCourseRow extends Record<string, unknown> {
  id: string;
  version: number;
  status: 'generating' | 'ready' | 'failed';
}

interface ChapterSnapshot {
  id: string;
  position: number;
  title: string;
  notions: { id: string; label: string; definition: string | null }[];
  passages: KnownChunk[];
  documents: TutorDocument[];
}

interface ModuleSnapshot {
  formationId: string;
  formationTitle: string;
  moduleTitle: string;
  modulePosition: number;
  profile: TutorProfile;
  chapters: ChapterSnapshot[];
  chunks: Map<string, KnownChunk>;
  allowedChunkIds: Set<string>;
}

const SECTION_KIND: Record<CourseSectionDraft['kind'], string> = {
  markdown: 'text',
  quick_question: 'flash_question',
  comparison: 'dont_confuse',
  tutor_addition: 'tutor_completed',
  takeaway: 'retain',
  summary_prompt: 'summary_prompt',
};

const MEDIA_KIND: Record<string, string> = {
  pdf: 'pdf',
  audio: 'audio',
  video: 'video',
  youtube: 'video',
  web: 'web',
  note: 'note',
  image: 'image',
};

function locationOf(value: unknown): Record<string, unknown> {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed: unknown = JSON.parse(value);
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function toKnownChunk(row: PassageRow, ownerId: string): KnownChunk {
  return {
    chunkId: row.chunk_id,
    ownerId,
    chapterId: row.chapter_id,
    resourceId: row.resource_id,
    resourceTitle: row.title,
    resourceKind: row.kind,
    resourceStatus: row.status,
    resourceDeleted: row.deleted_at !== null,
    resourceMime: row.mime,
    text: row.text,
    location: locationOf(row.location),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function uuidArray(ids: readonly string[]): string {
  return `{${ids.join(',')}}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message;
  return error instanceof Error ? error.message : 'La génération du cours a échoué.';
}

function retryable(error: unknown): boolean {
  return (
    isAppError(error) &&
    (error.code === 'AI_UNAVAILABLE' ||
      error.code === 'AI_RATE_LIMITED' ||
      error.code === 'SERVICE_UNAVAILABLE')
  );
}

function appError(code: string, message: string, cause?: unknown): AppError {
  return new AppError(code, message, cause === undefined ? {} : { cause });
}

async function readModuleContext(
  tx: DbTx,
  userId: string,
  moduleId: string,
): Promise<ModuleSnapshot> {
  const modules = await tx.execute<ModuleContextRow>(sql`
    select
      m.formation_id::text as formation_id,
      f.title as formation_title,
      m.id::text as module_id,
      m.title as module_title,
      m.position as module_position,
      p.tutor_tone::text as tone,
      p.course_language::text as course_language
    from public.modules m
    join public.formations f on f.id = m.formation_id
    join public.profiles p on p.id = ${userId}::uuid
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
  if (chapters.length === 0) {
    throw appError('VALIDATION_FAILED', 'Ce module ne contient aucun chapitre.');
  }

  const notions = await tx.execute<NotionRow>(sql`
    select id::text as id, chapter_id::text as chapter_id, label, short_definition
    from public.notions
    where module_id = ${moduleId}::uuid
    order by chapter_id asc, position asc, id asc
  `);

  const passages = await tx.execute<PassageRow>(sql`
    select
      c.id::text as chunk_id,
      c.resource_id::text as resource_id,
      c.chapter_id::text as chapter_id,
      c.text,
      c.location,
      r.title,
      r.kind::text as kind,
      r.status::text as status,
      r.deleted_at,
      r.mime
    from public.resource_chunks c
    join public.resources r on r.id = c.resource_id
    where c.owner_id = ${userId}::uuid
      and c.formation_id = ${module.formation_id}::uuid
      and c.chapter_id is not null
      and r.status = 'ready'
      and r.deleted_at is null
    order by r.created_at asc, c.position asc, c.id asc
  `);

  const chunks = new Map<string, KnownChunk>();
  const byChapter = new Map<string, KnownChunk[]>();
  for (const row of passages) {
    const chunk = toKnownChunk(row, userId);
    chunks.set(chunk.chunkId, chunk);
    const list = byChapter.get(row.chapter_id) ?? [];
    list.push(chunk);
    byChapter.set(row.chapter_id, list);
  }

  const allowedChunkIds = new Set<string>();
  const snapshots: ChapterSnapshot[] = chapters.map((chapter) => {
    const notionsOfChapter = notions
      .filter((notion) => notion.chapter_id === chapter.id)
      .map((notion) => ({
        id: notion.id,
        label: notion.label,
        definition: notion.short_definition,
      }));
    const documents: TutorDocument[] = [];
    let budget = RETRIEVAL_TOKEN_BUDGETS.course;
    for (const chunk of byChapter.get(chapter.id) ?? []) {
      const document: TutorDocument = {
        source: chunk.resourceTitle.slice(0, 200),
        chunkId: chunk.chunkId,
        title: chunk.resourceTitle.slice(0, 200),
        text: chunk.text,
      };
      const formatted = formatDocumentChunk({
        chunkId: chunk.chunkId,
        source: chunk.resourceTitle,
        text: chunk.text,
        location: asRecord(chunk.location) as never,
      });
      const cost = estimateTokens(formatted);
      if (cost > budget) break;
      budget -= cost;
      documents.push(document);
      allowedChunkIds.add(chunk.chunkId);
    }
    return {
      id: chapter.id,
      position: chapter.position,
      title: chapter.title,
      notions: notionsOfChapter,
      passages: byChapter.get(chapter.id) ?? [],
      documents,
    };
  });

  return {
    formationId: module.formation_id,
    formationTitle: module.formation_title,
    moduleTitle: module.module_title,
    modulePosition: module.module_position,
    profile: {
      tone: module.tone === 'tu' ? 'tu' : 'vous',
      courseLanguage:
        module.course_language === 'en' ||
        module.course_language === 'es' ||
        module.course_language === 'de'
          ? module.course_language
          : 'fr',
    },
    chapters: snapshots,
    chunks,
    allowedChunkIds,
  };
}

function documentsOf(chapter: ChapterSnapshot): TutorDocument[] {
  return chapter.documents;
}

function scenarioFor(ctx: CourseGenerationContext, chapter: ChapterSnapshot): string | undefined {
  const forced = ctx.deps?.scenarioForChapter?.(chapter.id);
  if (forced !== undefined) return forced;
  if (ctx.deps?.scenario !== undefined) return ctx.deps.scenario;
  return chapter.passages.length === 0 ? 'course-base' : 'course-sourced';
}

function assertDraftBelongsToChapter(
  draft: CourseChapterDraft,
  chapter: ChapterSnapshot,
  moduleNotionIds: ReadonlySet<string>,
): void {
  if (draft.chapterId !== chapter.id) {
    throw appError('INVALID_OUTPUT', 'Le tuteur a répondu pour un autre chapitre.');
  }
  const chapterNotionIds = new Set(chapter.notions.map((notion) => notion.id));
  for (const notionId of draft.notionIds) {
    if (!chapterNotionIds.has(notionId)) {
      throw appError('INVALID_OUTPUT', 'Le tuteur a cité une notion hors du chapitre.');
    }
  }
  for (const link of draft.links) {
    if (!moduleNotionIds.has(link.fromNotionId) || !moduleNotionIds.has(link.toNotionId)) {
      throw appError('INVALID_OUTPUT', 'Le tuteur a créé un lien vers une notion inconnue.');
    }
    if (link.fromNotionId === link.toNotionId) {
      throw appError('INVALID_OUTPUT', 'Le tuteur a relié une notion à elle-même.');
    }
  }
}

function sectionAnchor(
  chapter: ChapterSnapshot,
  section: CourseSectionDraft,
  position: number,
  used: Set<string>,
): string {
  const base =
    section.title ??
    (section.kind === 'takeaway'
      ? 'a-retenir'
      : section.kind === 'quick_question'
        ? 'question-eclair'
        : section.kind === 'comparison'
          ? 'ne-pas-confondre'
          : section.kind === 'summary_prompt'
            ? 'resume'
            : `section-${String(position)}`);
  const slug =
    base
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || `section-${String(position)}`;
  let anchor = `ch-${String(chapter.position)}-${slug}`.slice(0, 80);
  let suffix = 2;
  while (used.has(anchor)) {
    anchor = `ch-${String(chapter.position)}-${slug}-${String(suffix)}`.slice(0, 80);
    suffix += 1;
  }
  used.add(anchor);
  return anchor;
}

function dataOf(section: CourseSectionDraft): Record<string, unknown> | null {
  switch (section.kind) {
    case 'quick_question':
      return { question: section.question, answer: section.answer };
    case 'comparison':
      return { left: section.left, right: section.right };
    case 'takeaway':
      return {
        points: section.points,
        ...(section.diagram === undefined ? {} : { diagram: section.diagram }),
        ...(section.mnemonic === undefined ? {} : { mnemonic: section.mnemonic }),
      };
    case 'markdown':
    case 'tutor_addition':
    case 'summary_prompt':
      return null;
  }
}

function contentOf(section: CourseSectionDraft): string | null {
  if (section.kind === 'markdown' || section.kind === 'tutor_addition') return section.contentMd;
  if (section.kind === 'summary_prompt') return section.prompt ?? null;
  return null;
}

function mediaOf(chunk: KnownChunk): string {
  if (chunk.resourceKind === 'exam_guide') {
    return chunk.resourceMime?.startsWith('application/pdf') === true ? 'pdf' : 'web';
  }
  return MEDIA_KIND[chunk.resourceKind] ?? 'web';
}

function citationsOf(
  resolved: readonly ResolvedCitation[],
  chapterId: string,
  sectionIndex: number,
): ResolvedCitation[] {
  return resolved.filter(
    (citation) => citation.chapterId === chapterId && citation.sectionIndex === sectionIndex,
  );
}

async function insertSuggestions(
  tx: DbTx,
  ctx: CourseGenerationContext,
  formationId: string,
  chapter: ChapterSnapshot,
  draft: CourseChapterDraft,
  now: string,
): Promise<void> {
  for (const suggestion of draft.resourceSuggestions) {
    const canonical = canonicalizeUrl(suggestion.url);
    if (canonical === null || !isPublicHttpUrl(canonical)) continue;
    const existing = await tx.execute<{ id: string }>(sql`
      select id::text as id
      from public.resources
      where owner_id = ${ctx.userId}::uuid
        and chapter_id = ${chapter.id}::uuid
        and origin = 'tutor_suggestion'
        and url = ${canonical}
        and deleted_at is null
      limit 1
    `);
    if (existing[0] !== undefined) continue;
    await tx.execute(sql`
      insert into public.resources (
        owner_id, formation_id, chapter_id, kind, origin, suggestion_status, title, url, status,
        metadata, created_at, updated_at
      ) values (
        ${ctx.userId}::uuid,
        ${formationId}::uuid,
        ${chapter.id}::uuid,
        'web',
        'tutor_suggestion',
        'pending',
        ${suggestion.title},
        ${canonical},
        'queued',
        ${JSON.stringify({ suggestionReason: suggestion.reason })}::jsonb,
        ${now}::timestamptz,
        ${now}::timestamptz
      )
    `);
  }
}

async function insertNotionLinks(
  tx: DbTx,
  ctx: CourseGenerationContext,
  formationId: string,
  draft: CourseChapterDraft,
  now: string,
): Promise<void> {
  for (const link of draft.links) {
    const [from, to] =
      link.kind === 'confusion' && link.fromNotionId > link.toNotionId
        ? [link.toNotionId, link.fromNotionId]
        : [link.fromNotionId, link.toNotionId];
    await tx.execute(sql`
      insert into public.notion_links (
        formation_id, from_notion_id, to_notion_id, kind, owner_id, rationale, created_at
      ) values (
        ${formationId}::uuid,
        ${from}::uuid,
        ${to}::uuid,
        ${link.kind}::public.link_kind,
        ${ctx.userId}::uuid,
        'Lien proposé par le cours généré.',
        ${now}::timestamptz
      )
      on conflict do nothing
    `);
  }
}

function chunksByIds(tx: DbTx, userId: string, chunkIds: readonly string[]): Promise<PassageRow[]> {
  if (chunkIds.length === 0) return Promise.resolve([]);
  return tx.execute<PassageRow>(sql`
    select
      c.id::text as chunk_id,
      c.resource_id::text as resource_id,
      c.chapter_id::text as chapter_id,
      c.text,
      c.location,
      r.title,
      r.kind::text as kind,
      r.status::text as status,
      r.deleted_at,
      r.mime
    from public.resource_chunks c
    join public.resources r on r.id = c.resource_id
    where c.owner_id = ${userId}::uuid
      and c.id = any(${uuidArray(chunkIds)}::uuid[])
  `);
}

async function persistVersion(
  ctx: CourseGenerationContext,
  draft: CourseDraft,
  snapshot: ModuleSnapshot,
  model: string | null,
  resolved: readonly ResolvedCitation[],
): Promise<CourseGenerationResult> {
  return ctx.store.run(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`course-generation:${ctx.userId}:${ctx.moduleId}`}, 0))`,
    );
    const existing = await tx.execute<ExistingCourseRow>(sql`
      select id::text as id, version, status::text as status
      from public.courses
      where owner_id = ${ctx.userId}::uuid
        and module_id = ${ctx.moduleId}::uuid
        and generation_key = ${ctx.generationKey}
      limit 1
    `);
    if (existing[0] !== undefined) {
      return {
        courseId: existing[0].id,
        moduleId: ctx.moduleId,
        version: existing[0].version,
        status: existing[0].status === 'ready' ? 'ready' : 'failed',
        created: false,
      };
    }

    const cited = [...new Set(draft.chapters.flatMap((chapter) => chapter.sourceChunkIds))];
    const fresh = await chunksByIds(tx, ctx.userId, cited);
    const freshMap = new Map<string, KnownChunk>();
    for (const row of fresh) {
      freshMap.set(row.chunk_id, toKnownChunk(row, ctx.userId));
    }
    const checked = validateCourseCitations(draft, {
      userId: ctx.userId,
      chunks: freshMap,
      allowedChunkIds: snapshot.allowedChunkIds,
    });
    if (!checked.ok) {
      throw appError(
        'CITATION_SOURCE_DELETED',
        'Une source du cours a changé pendant sa rédaction.',
        new Error(citationFailureSummary(checked.issues)),
      );
    }

    const versions = await tx.execute<{ next: number }>(sql`
      select coalesce(max(version), 0)::int + 1 as next
      from public.courses
      where owner_id = ${ctx.userId}::uuid and module_id = ${ctx.moduleId}::uuid
    `);
    const version = versions[0]?.next ?? 1;
    const now = ctx.clock.now().toISOString();
    const inserted = await tx.execute<{ id: string }>(sql`
      insert into public.courses (
        owner_id, formation_id, module_id, version, is_current, status, model, generation_key,
        created_at, updated_at
      ) values (
        ${ctx.userId}::uuid,
        ${snapshot.formationId}::uuid,
        ${ctx.moduleId}::uuid,
        ${version},
        true,
        'ready',
        ${model},
        ${ctx.generationKey},
        ${now}::timestamptz,
        ${now}::timestamptz
      )
      returning id::text as id
    `);
    const courseId = inserted[0]?.id;
    if (courseId === undefined) {
      throw appError('INTERNAL_ERROR', 'La version du cours n’a pas pu être créée.');
    }

    const usedAnchors = new Set<string>();
    for (const chapterDraft of draft.chapters) {
      const chapter = snapshot.chapters.find((entry) => entry.id === chapterDraft.chapterId);
      if (chapter === undefined) {
        throw appError('INVALID_OUTPUT', 'Le cours cite un chapitre inconnu.');
      }
      for (const [index, section] of chapterDraft.sections.entries()) {
        const position = index + 1;
        const anchor = sectionAnchor(chapter, section, position, usedAnchors);
        const origin =
          ('sourceChunkIds' in section ? section.sourceChunkIds : []).length > 0
            ? 'resource'
            : 'tutor';
        const sectionRows = await tx.execute<{ id: string }>(sql`
          insert into public.course_sections (
            course_id, owner_id, chapter_id, position, kind, anchor, title, content_md, data,
            notion_ids, origin, version, reported, created_at, updated_at
          ) values (
            ${courseId}::uuid,
            ${ctx.userId}::uuid,
            ${chapter.id}::uuid,
            ${position},
            ${SECTION_KIND[section.kind]}::public.section_kind,
            ${anchor},
            ${section.title ?? null},
            ${contentOf(section)},
            ${dataOf(section) === null ? null : JSON.stringify(dataOf(section))}::jsonb,
            ${uuidArray(section.notionIds)}::uuid[],
            ${origin}::public.content_origin,
            1,
            false,
            ${now}::timestamptz,
            ${now}::timestamptz
          )
          returning id::text as id
        `);
        const sectionId = sectionRows[0]?.id;
        if (sectionId === undefined) {
          throw appError('INTERNAL_ERROR', 'Une section du cours n’a pas pu être créée.');
        }
        for (const citation of citationsOf(resolved, chapter.id, index)) {
          await tx.execute(sql`
            insert into public.citations (
              section_id, owner_id, chunk_id, resource_id, quote, location, label, media_kind,
              created_at
            ) values (
              ${sectionId}::uuid,
              ${ctx.userId}::uuid,
              ${citation.chunk.chunkId}::uuid,
              ${citation.chunk.resourceId}::uuid,
              null,
              ${JSON.stringify(citation.chunk.location)}::jsonb,
              ${citation.chunk.resourceTitle.slice(0, 120)},
              ${mediaOf(citation.chunk)}::public.citation_media,
              ${now}::timestamptz
            )
          `);
        }
      }
      await insertSuggestions(tx, ctx, snapshot.formationId, chapter, chapterDraft, now);
      await insertNotionLinks(tx, ctx, snapshot.formationId, chapterDraft, now);
    }

    return { courseId, moduleId: ctx.moduleId, version, status: 'ready', created: true };
  });
}

async function persistFailedVersion(
  ctx: CourseGenerationContext,
  snapshot: ModuleSnapshot,
  message: string,
): Promise<CourseGenerationResult | null> {
  return ctx.store.run(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`course-generation:${ctx.userId}:${ctx.moduleId}`}, 0))`,
    );
    const existing = await tx.execute<ExistingCourseRow>(sql`
      select id::text as id, version, status::text as status
      from public.courses
      where owner_id = ${ctx.userId}::uuid
        and module_id = ${ctx.moduleId}::uuid
        and generation_key = ${ctx.generationKey}
      limit 1
    `);
    if (existing[0] !== undefined) {
      return {
        courseId: existing[0].id,
        moduleId: ctx.moduleId,
        version: existing[0].version,
        status: existing[0].status === 'ready' ? 'ready' : 'failed',
        created: false,
      };
    }
    const versions = await tx.execute<{ next: number }>(sql`
      select coalesce(max(version), 0)::int + 1 as next
      from public.courses
      where owner_id = ${ctx.userId}::uuid and module_id = ${ctx.moduleId}::uuid
    `);
    const version = versions[0]?.next ?? 1;
    const now = ctx.clock.now().toISOString();
    const inserted = await tx.execute<{ id: string }>(sql`
      insert into public.courses (
        owner_id, formation_id, module_id, version, is_current, status, model, error,
        generation_key, created_at, updated_at
      ) values (
        ${ctx.userId}::uuid,
        ${snapshot.formationId}::uuid,
        ${ctx.moduleId}::uuid,
        ${version},
        false,
        'failed',
        null,
        ${message.slice(0, 2000)},
        ${ctx.generationKey},
        ${now}::timestamptz,
        ${now}::timestamptz
      )
      returning id::text as id
    `);
    const courseId = inserted[0]?.id;
    return courseId === undefined
      ? null
      : { courseId, moduleId: ctx.moduleId, version, status: 'failed' as const, created: true };
  });
}

async function notifyFailure(
  ctx: CourseGenerationContext,
  snapshot: ModuleSnapshot,
  message: string,
  version: number,
): Promise<void> {
  await ctx.events.notificationRequested({
    userId: ctx.userId,
    type: 'ai_task_failed',
    formationId: snapshot.formationId,
    dedupeKey: `course-failed:${ctx.moduleId}:${String(version)}`,
    data: {
      taskLabel: 'La rédaction du cours',
      moduleTitle: snapshot.moduleTitle,
      formationTitle: snapshot.formationTitle,
      href: `/formations/${snapshot.formationId}/modules/${ctx.moduleId}`,
      reason: message.slice(0, 500),
    },
  });
}

/**
 * EF-1 to EF-5 — generates the whole module chapter by chapter, validates every citation twice,
 * persists one atomic version and asks for the question banks and the "course ready" notification.
 */
export async function generateCourseForModule(
  ctx: CourseGenerationContext,
): Promise<CourseGenerationResult> {
  if (ctx.generationKey.length === 0 || ctx.generationKey.length > 200) {
    throw appError('VALIDATION_FAILED', 'La clé de génération est invalide.');
  }

  const snapshot = await ctx.store.run((tx) => readModuleContext(tx, ctx.userId, ctx.moduleId));
  const existing = await ctx.store.run(async (tx) => {
    const rows = await tx.execute<ExistingCourseRow>(sql`
      select id::text as id, version, status::text as status
      from public.courses
      where owner_id = ${ctx.userId}::uuid
        and module_id = ${ctx.moduleId}::uuid
        and generation_key = ${ctx.generationKey}
      limit 1
    `);
    return rows[0];
  });
  if (existing !== undefined) {
    return {
      courseId: existing.id,
      moduleId: ctx.moduleId,
      version: existing.version,
      status: existing.status === 'ready' ? 'ready' : 'failed',
      created: false,
    };
  }

  const notionIds = new Set(
    snapshot.chapters.flatMap((chapter) => chapter.notions.map((n) => n.id)),
  );
  const drafts: CourseChapterDraft[] = [];
  let model: string | null = null;

  try {
    for (const chapter of snapshot.chapters) {
      const scenario = scenarioFor(ctx, chapter);
      const generated = await runCourseChapter(
        {
          userId: ctx.userId,
          formationId: snapshot.formationId,
          profile: snapshot.profile,
          clock: ctx.clock,
          requestId: ctx.requestId,
          llmDb: ctx.llmDb,
          ...(scenario === undefined ? {} : { scenario }),
        },
        {
          profile: snapshot.profile,
          chapterId: chapter.id,
          chapterTitle: chapter.title,
          chapterPosition: chapter.position,
          moduleTitle: snapshot.moduleTitle,
          formationTitle: snapshot.formationTitle,
          notions: chapter.notions,
          documents: documentsOf(chapter),
          baseCourse: chapter.passages.length === 0,
        },
      );
      if (!generated.ok) throw generated.error;
      model = generated.value.model ?? model;
      assertDraftBelongsToChapter(generated.value.draft, chapter, notionIds);
      drafts.push(generated.value.draft);
    }

    const draft = CourseDraftSchema.parse({ chapters: drafts });
    const checked = validateCourseCitations(draft, {
      userId: ctx.userId,
      chunks: snapshot.chunks,
      allowedChunkIds: snapshot.allowedChunkIds,
    });
    if (!checked.ok) {
      throw appError(
        'CITATION_INVALID',
        'Une citation du cours ne correspond pas à un passage prêt du chapitre.',
        new Error(citationFailureSummary(checked.issues)),
      );
    }

    const result = await persistVersion(ctx, draft, snapshot, model, checked.citations);
    if (result.created) {
      await ctx.events.generated({
        userId: ctx.userId,
        courseId: result.courseId,
        moduleId: ctx.moduleId,
        version: result.version,
        formationId: snapshot.formationId,
      });
      await ctx.events.notificationRequested({
        userId: ctx.userId,
        type: 'course_ready',
        formationId: snapshot.formationId,
        dedupeKey: `course-ready:${result.courseId}`,
        data: {
          moduleTitle: snapshot.moduleTitle,
          formationTitle: snapshot.formationTitle,
          href: `/formations/${snapshot.formationId}/modules/${ctx.moduleId}/cours`,
        },
      });
    }
    return result;
  } catch (error) {
    const message = errorMessage(error);
    ctx.logger.warn('course generation failed', {
      operation: 'course_generation',
      outcome: 'failed',
      code: isAppError(error) ? error.code : 'INTERNAL_ERROR',
    });
    if (!retryable(error)) {
      const failed = await persistFailedVersion(ctx, snapshot, message);
      if (failed !== null && failed.created)
        await notifyFailure(ctx, snapshot, message, failed.version);
    }
    throw error;
  }
}
