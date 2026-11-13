// Read model of SCR-06 (SPEC-607 EF-1 to EF-5, ET-1, BR-APP-04, BR-APP-07, BR-NAP-04).
//
// Every query runs in the learner's Row Level Security transaction: another owner's formation is
// the same NOT_FOUND as an unknown one, and the apports of another member of a shared formation are
// invisible. The selected chapter comes from `?chapitre=` when it belongs to the module; otherwise
// the first chapter still in progress is chosen. Statuses, pages and sizes are read from the
// persisted rows, never from a client-side provisional state.
import { RESOURCE_LIMITS } from '@learny/config';
import {
  ModuleScreen,
  type ModuleChapterItem,
  type ModuleScreen as ModuleScreenDto,
  type ResourceListItem,
  type ResourceSuggestionItem,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql } from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from './result';

const ACTIVE_FORMATION_STATUSES = new Set(['active', 'paused', 'completed']);

interface ModuleRow extends Record<string, unknown> {
  formation_id: string;
  formation_title: string;
  formation_status: string;
  id: string;
  position: number;
  title: string;
  planned_start: string;
  planned_end: string;
  threshold: number;
  status: string;
  position_total: number;
}

interface ChapterRow extends Record<string, unknown> {
  id: string;
  position: number;
  title: string;
  contributions_status: string;
  done_at: Date | string | null;
  resource_count: number;
}

interface ResourceRow extends Record<string, unknown> {
  id: string;
  kind: string;
  title: string;
  status: string;
  error_code: string | null;
  error_message: string | null;
  size_bytes: number | null;
  url: string | null;
  metadata: { pages?: number; suggestionReason?: string };
  created_at: Date | string;
  updated_at: Date | string;
  suggestion_status: string | null;
  origin: string;
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function moduleStatus(value: string): 'locked' | 'open' | 'validated' {
  if (value === 'locked' || value === 'open' || value === 'validated') return value;
  throw new AppError('INTERNAL_ERROR', 'Statut de module inconnu.');
}

function chapterStatus(value: string): 'in_progress' | 'done' {
  return value === 'done' ? 'done' : 'in_progress';
}

function toResource(row: ResourceRow): ResourceListItem {
  return {
    id: row.id,
    kind: row.kind as ResourceListItem['kind'],
    title: row.title,
    status: row.status as ResourceListItem['status'],
    errorCode: row.error_code,
    errorMessage: row.error_message,
    sizeBytes: row.size_bytes,
    pages: row.metadata.pages ?? null,
    url: row.url,
    createdAt: iso(row.created_at) ?? '',
    updatedAt: iso(row.updated_at) ?? '',
  };
}

function toSuggestion(row: ResourceRow): ResourceSuggestionItem {
  return {
    id: row.id,
    title: row.title,
    url: row.url ?? '',
    reason: row.metadata.suggestionReason ?? 'Ressource trouvée pour ce chapitre.',
    createdAt: iso(row.created_at) ?? '',
  };
}

/**
 * SCR-06 read model. The module must belong to an active programme of the caller; a locked module
 * is still readable for its lock notice, but no mutation is accepted by the other services.
 */
export function getModuleScreen(
  ctx: ServiceContext,
  moduleId: string,
  selectedChapterId?: string,
): Promise<Result<ModuleScreenDto>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return db.run(async (tx): Promise<ModuleScreenDto> => {
      const modules = await tx.execute<ModuleRow>(sql`
        select f.id::text as formation_id,
               f.title as formation_title,
               f.status::text as formation_status,
               m.id::text as id,
               m.position,
               m.title,
               m.planned_start::text as planned_start,
               m.planned_end::text as planned_end,
               m.threshold,
               coalesce(mp.status, m.status)::text as status,
               (select count(*) from public.modules mm where mm.formation_id = m.formation_id)::int
                 as position_total
        from public.modules m
        join public.formations f on f.id = m.formation_id
        left join public.module_progress mp
          on mp.module_id = m.id and mp.user_id = ${userId}::uuid
        where m.id = ${moduleId}::uuid
      `);
      const module = modules[0];
      if (module === undefined) {
        throw new AppError('NOT_FOUND', 'Module introuvable.');
      }
      if (!ACTIVE_FORMATION_STATUSES.has(module.formation_status)) {
        throw new AppError('CONFLICT', 'Le programme n’est pas encore actif.', { status: 409 });
      }

      const chapterRows = await tx.execute<ChapterRow>(sql`
        select c.id::text as id,
               c.position,
               c.title,
               coalesce(cp.contributions_status, 'in_progress')::text as contributions_status,
               cp.done_at,
               (
                 select count(*)::int
                 from public.resources r
                 where r.chapter_id = c.id
                   and r.owner_id = ${userId}::uuid
                   and r.origin = 'learner'
                   and r.deleted_at is null
               ) as resource_count
        from public.chapters c
        left join public.chapter_progress cp
          on cp.chapter_id = c.id and cp.user_id = ${userId}::uuid
        where c.module_id = ${moduleId}::uuid
        order by c.position asc
      `);
      if (chapterRows.length === 0) {
        throw new AppError('CONFLICT', 'Ce module n’a aucun chapitre.', { status: 409 });
      }

      const chapters: ModuleChapterItem[] = chapterRows.map((row) => ({
        id: row.id,
        position: row.position,
        title: row.title,
        contributionsStatus: chapterStatus(row.contributions_status),
        doneAt: iso(row.done_at),
        resourceCount: row.resource_count,
      }));

      const requested = chapters.find((chapter) => chapter.id === selectedChapterId);
      const selected =
        requested ??
        chapters.find((chapter) => chapter.contributionsStatus === 'in_progress') ??
        chapters[0];
      if (selected === undefined) {
        throw new AppError('CONFLICT', 'Ce module n’a aucun chapitre.', { status: 409 });
      }

      const resourceRows = await tx.execute<ResourceRow>(sql`
        select r.id::text as id,
               r.kind::text as kind,
               r.origin::text as origin,
               r.suggestion_status::text as suggestion_status,
               r.title,
               r.url,
               r.metadata,
               r.status::text as status,
               r.error_code,
               r.error_message,
               r.size_bytes::float8 as size_bytes,
               r.created_at,
               r.updated_at
        from public.resources r
        where r.owner_id = ${userId}::uuid
          and r.chapter_id = ${selected.id}::uuid
          and r.origin = 'learner'
          and r.deleted_at is null
        order by r.created_at asc, r.id asc
      `);
      const suggestionRows = await tx.execute<ResourceRow>(sql`
        select r.id::text as id,
               r.kind::text as kind,
               r.origin::text as origin,
               r.suggestion_status::text as suggestion_status,
               r.title,
               r.url,
               r.metadata,
               r.status::text as status,
               r.error_code,
               r.error_message,
               r.size_bytes::float8 as size_bytes,
               r.created_at,
               r.updated_at
        from public.resources r
        where r.owner_id = ${userId}::uuid
          and r.chapter_id = ${selected.id}::uuid
          and r.origin = 'tutor_suggestion'
          and r.suggestion_status = 'pending'
          and r.deleted_at is null
        order by r.created_at desc, r.id desc
      `);

      const used = await tx.execute<{ used: number }>(sql`
        select coalesce(sum(r.size_bytes), 0)::float8 as used
        from public.resources r
        where r.owner_id = ${userId}::uuid
          and r.deleted_at is null
          and r.size_bytes is not null
      `);

      const chaptersDone = chapters.filter(
        (chapter) => chapter.contributionsStatus === 'done',
      ).length;
      return ModuleScreen.parse({
        formation: { id: module.formation_id, title: module.formation_title },
        module: {
          id: module.id,
          position: module.position,
          positionTotal: module.position_total,
          title: module.title,
          plannedStart: module.planned_start,
          plannedEnd: module.planned_end,
          threshold: module.threshold,
          status: moduleStatus(module.status),
        },
        chapters,
        selectedChapterId: selected.id,
        resources: resourceRows.map(toResource),
        suggestions: suggestionRows.map(toSuggestion),
        counts: {
          chaptersDone,
          chaptersTotal: chapters.length,
          chapterResources: resourceRows.length,
          chapterResourceLimit: RESOURCE_LIMITS.perChapter,
          storageUsedBytes: used[0]?.used ?? 0,
          storageQuotaBytes: RESOURCE_LIMITS.userQuotaBytes,
        },
        allChaptersDone: chaptersDone === chapters.length,
      });
    });
  });
}
