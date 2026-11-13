import { sql } from 'drizzle-orm';

import { validateBrick, type BrickIssue } from '@learny/bricks';
import {
  DueNotionsSchema,
  type DueNotions,
  type InvalidOutputNotice,
} from '@learny/contracts';
import { AppError, nextOutsideQuietHours, userDayBounds, userLocalDay } from '@learny/core';
import {
  createActivity,
  createNotification,
  createScheduleSlot,
  type DbTx,
  type UserDatabase,
} from '@learny/db';

import type {
  AssembleActivityInput,
  CreateOrUpdateInput,
  GetDueNotionsInput,
  GradeAnswerInput,
  PrepareQuestionBankInput,
  ReadResourcesInput,
  ReadResultsInput,
  ScheduleInput,
  ScheduleReminderInput,
  SearchWebInput,
} from './schemas';
import type { ToolScope } from './types';

// Application-service adapter of the tutor actions (SPEC-508 ET-1, ET-4). Every method receives the
// authenticated scope and runs on the caller's `DbTx` opened by `UserDatabase.run`, so RLS applies
// and a failed action rolls back alone. Pure tools never import this module's SQL.

export interface PassageResult {
  chunkId: string;
  resourceId: string;
  title: string;
  text: string;
  score?: number;
}

export interface WebSearchPort {
  search(input: { query: string; maxResults: number }): Promise<{
    results: { title: string; url: string; snippet: string }[];
    provider: string;
  }>;
}

export interface QuestionBankPort {
  request(input: {
    userId: string;
    formationId: string;
    notionIds: string[];
    format: string;
    count: number;
    requestId: string;
    now: Date;
  }): Promise<void>;
}

export interface ModuleRef {
  id: string;
  formationId: string;
}

export interface ChapterRef extends ModuleRef {
  moduleId: string;
}

export interface NotionRef extends ChapterRef {
  chapterId: string;
}

export interface BrickRef {
  id: string;
  ownerId: string;
  formationId: string;
  status: 'active' | 'reported' | 'retired';
  currentVersion: number;
}

export interface BrickVersionRef {
  id: string;
  brickId: string;
  ownerId: string;
  formationId: string;
  status: 'active' | 'reported' | 'retired';
}

export interface ActivityRef {
  id: string;
  ownerId: string;
  formationId: string;
  status: 'draft' | 'ready' | 'archived';
}

export interface AttemptRef {
  id: string;
  userId: string;
  status: string;
  activityId: string;
  formationId: string;
}

export interface TutorToolRuntime {
  canAccessFormation(scope: ToolScope, formationId: string): Promise<boolean>;
  module(scope: ToolScope, moduleId: string): Promise<ModuleRef | null>;
  chapter(scope: ToolScope, chapterId: string): Promise<ChapterRef | null>;
  notion(scope: ToolScope, notionId: string): Promise<NotionRef | null>;
  brick(scope: ToolScope, brickId: string): Promise<BrickRef | null>;
  brickVersion(scope: ToolScope, versionId: string): Promise<BrickVersionRef | null>;
  activity(scope: ToolScope, activityId: string): Promise<ActivityRef | null>;
  attempt(scope: ToolScope, attemptId: string): Promise<AttemptRef | null>;
  readPassages(
    scope: ToolScope,
    input: ReadResourcesInput,
  ): Promise<{ passages: PassageResult[]; tokenCount: number; truncated: boolean }>;
  searchWeb(scope: ToolScope, input: SearchWebInput): Promise<{
    results: { title: string; url: string; snippet: string }[];
    provider: string;
  }>;
  writeStructure(
    scope: ToolScope,
    input: CreateOrUpdateInput,
  ): Promise<{
    kind: 'module' | 'chapter' | 'notion' | 'notion_link' | 'brick';
    id: string;
    created: boolean;
    version?: number;
    fingerprint?: string | null;
  }>;
  assembleActivity(
    scope: ToolScope,
    input: AssembleActivityInput,
  ): Promise<{ activityId: string; kind: string; status: 'draft' | 'ready'; itemCount: number }>;
  schedule(
    scope: ToolScope,
    input: ScheduleInput,
  ): Promise<{ slotId: string; startsAt: string; endsAt: string; status: 'planned' }>;
  /** True when a planned or missed slot already intersects the requested window. */
  slotOverlap(scope: ToolScope, startsAt: Date, endsAt: Date): Promise<boolean>;
  scheduleReminder(
    scope: ToolScope,
    input: ScheduleReminderInput,
  ): Promise<{ notificationId: string; scheduledFor: string; channels: ('email' | 'push')[] }>;
  getDueNotions(scope: ToolScope, input: GetDueNotionsInput): Promise<DueNotions>;
  readResults(scope: ToolScope, input: ReadResultsInput): Promise<{
    attempts: {
      attemptId: string;
      activityId: string;
      activityKind: string;
      status: string;
      score: number | null;
      passed: boolean | null;
      submittedAt: string | null;
    }[];
    states: {
      notionId: string;
      label: string;
      mastery: number;
      dueAt: string | null;
      gapNature: 'forgetting' | 'confusion' | 'misunderstanding' | 'application' | null;
    }[];
  }>;
  gradeAnswer(
    scope: ToolScope,
    input: GradeAnswerInput,
  ): Promise<{
    answerId: string;
    score: number;
    maxScore: number;
    isCorrect: boolean;
    gradedBy: 'tutor';
  }>;
  prepareQuestionBank(
    scope: ToolScope,
    input: PrepareQuestionBankInput,
  ): Promise<{
    requestId: string;
    accepted: true;
    notionIds: string[];
    format: PrepareQuestionBankInput['format'];
    count: number;
  }>;
  /** Active `bank` bricks already available for these notions and this format (BR-MEM-07). */
  bankCount(scope: ToolScope, notionIds: readonly string[], format: string): Promise<number>;
}

/** Token ceilings of `docs/architecture/ai.md` §3, in tokens, for the `read_resources` action. */
export const READ_RESOURCES_TOKEN_BUDGET = {
  programme: 6_000,
  course: 24_000,
  tutor: 4_000,
} as const;

function uuidArray(ids: readonly string[]): string {
  return ids.length === 0 ? '{}' : `{${ids.join(',')}}`;
}

function escapeLike(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('%', '\\%').replaceAll('_', '\\_');
}

function brickIssues(issues: readonly BrickIssue[]): AppError {
  return new AppError('BRICK_INVALID', 'La brique est invalide.', {
    errors: issues.map((issue) => ({
      code: issue.code,
      path: issue.path,
      message: issue.message,
    })),
  });
}

function safeScore(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export interface TutorRuntimePorts {
  webSearch?: WebSearchPort;
  questionBank?: QuestionBankPort;
}

export function createDbToolRuntime(tx: DbTx, ports: TutorRuntimePorts = {}): TutorToolRuntime {
  async function canAccessFormation(scope: ToolScope, formationId: string): Promise<boolean> {
    if (scope.formationId !== null && scope.formationId !== formationId) return false;
    const rows = await tx.execute<{ id: string }>(sql`
      select f.id::text as id
      from public.formations f
      where f.id = ${formationId}::uuid
        and (
          f.owner_id = ${scope.userId}::uuid
          or exists (
            select 1
            from public.group_members gm
            join public.groups g on g.id = gm.group_id
            where g.formation_id = f.id
              and gm.user_id = ${scope.userId}::uuid
              and gm.member_status = 'active'
              and gm.left_at is null
          )
        )
    `);
    return rows[0] !== undefined;
  }

  async function module(scope: ToolScope, moduleId: string): Promise<ModuleRef | null> {
    const rows = await tx.execute<{ id: string; formation_id: string }>(sql`
      select m.id::text as id, m.formation_id::text as formation_id
      from public.modules m
      join public.formations f on f.id = m.formation_id
      where m.id = ${moduleId}::uuid
        and (
          f.owner_id = ${scope.userId}::uuid
          or exists (
            select 1 from public.group_members gm
            join public.groups g on g.id = gm.group_id
            where g.formation_id = f.id and gm.user_id = ${scope.userId}::uuid
              and gm.member_status = 'active' and gm.left_at is null
          )
        )
    `);
    const row = rows[0];
    return row === undefined ? null : { id: row.id, formationId: row.formation_id };
  }

  async function chapter(scope: ToolScope, chapterId: string): Promise<ChapterRef | null> {
    const rows = await tx.execute<{ id: string; formation_id: string; module_id: string }>(sql`
      select c.id::text as id, c.formation_id::text as formation_id, c.module_id::text as module_id
      from public.chapters c
      join public.formations f on f.id = c.formation_id
      where c.id = ${chapterId}::uuid
        and (
          f.owner_id = ${scope.userId}::uuid
          or exists (
            select 1 from public.group_members gm
            join public.groups g on g.id = gm.group_id
            where g.formation_id = f.id and gm.user_id = ${scope.userId}::uuid
              and gm.member_status = 'active' and gm.left_at is null
          )
        )
    `);
    const row = rows[0];
    return row === undefined
      ? null
      : { id: row.id, formationId: row.formation_id, moduleId: row.module_id };
  }

  async function notion(scope: ToolScope, notionId: string): Promise<NotionRef | null> {
    const rows = await tx.execute<{
      id: string;
      formation_id: string;
      module_id: string;
      chapter_id: string;
    }>(sql`
      select
        n.id::text as id,
        n.formation_id::text as formation_id,
        n.module_id::text as module_id,
        n.chapter_id::text as chapter_id
      from public.notions n
      join public.formations f on f.id = n.formation_id
      where n.id = ${notionId}::uuid
        and (
          f.owner_id = ${scope.userId}::uuid
          or exists (
            select 1 from public.group_members gm
            join public.groups g on g.id = gm.group_id
            where g.formation_id = f.id and gm.user_id = ${scope.userId}::uuid
              and gm.member_status = 'active' and gm.left_at is null
          )
        )
    `);
    const row = rows[0];
    return row === undefined
      ? null
      : {
          id: row.id,
          formationId: row.formation_id,
          moduleId: row.module_id,
          chapterId: row.chapter_id,
        };
  }

  async function brick(scope: ToolScope, brickId: string): Promise<BrickRef | null> {
    const rows = await tx.execute<{
      id: string;
      owner_id: string;
      formation_id: string;
      status: string;
      current_version: number;
    }>(sql`
      select
        b.id::text as id,
        b.owner_id::text as owner_id,
        b.formation_id::text as formation_id,
        b.status::text as status,
        b.current_version
      from public.bricks b
      where b.id = ${brickId}::uuid and b.owner_id = ${scope.userId}::uuid
    `);
    const row = rows[0];
    if (row === undefined) return null;
    return {
      id: row.id,
      ownerId: row.owner_id,
      formationId: row.formation_id,
      status: row.status as BrickRef['status'],
      currentVersion: row.current_version,
    };
  }

  async function brickVersion(
    scope: ToolScope,
    versionId: string,
  ): Promise<BrickVersionRef | null> {
    const rows = await tx.execute<{
      id: string;
      brick_id: string;
      owner_id: string;
      formation_id: string;
      status: string;
    }>(sql`
      select
        v.id::text as id,
        v.brick_id::text as brick_id,
        b.owner_id::text as owner_id,
        b.formation_id::text as formation_id,
        b.status::text as status
      from public.brick_versions v
      join public.bricks b on b.id = v.brick_id
      where v.id = ${versionId}::uuid and b.owner_id = ${scope.userId}::uuid
    `);
    const row = rows[0];
    if (row === undefined) return null;
    return {
      id: row.id,
      brickId: row.brick_id,
      ownerId: row.owner_id,
      formationId: row.formation_id,
      status: row.status as BrickVersionRef['status'],
    };
  }

  async function activity(scope: ToolScope, activityId: string): Promise<ActivityRef | null> {    const rows = await tx.execute<{
      id: string;
      owner_id: string;
      formation_id: string;
      status: string;
    }>(sql`
      select
        a.id::text as id,
        a.owner_id::text as owner_id,
        a.formation_id::text as formation_id,
        a.status::text as status
      from public.activities a
      where a.id = ${activityId}::uuid and a.owner_id = ${scope.userId}::uuid
    `);
    const row = rows[0];
    if (row === undefined) return null;
    return {
      id: row.id,
      ownerId: row.owner_id,
      formationId: row.formation_id,
      status: row.status as ActivityRef['status'],
    };
  }

  async function attempt(scope: ToolScope, attemptId: string): Promise<AttemptRef | null> {
    const rows = await tx.execute<{
      id: string;
      user_id: string;
      status: string;
      activity_id: string;
      formation_id: string;
    }>(sql`
      select
        a.id::text as id,
        a.user_id::text as user_id,
        a.status::text as status,
        a.activity_id::text as activity_id,
        act.formation_id::text as formation_id
      from public.attempts a
      join public.activities act on act.id = a.activity_id
      where a.id = ${attemptId}::uuid and a.user_id = ${scope.userId}::uuid
    `);
    const row = rows[0];
    if (row === undefined) return null;
    return {
      id: row.id,
      userId: row.user_id,
      status: row.status,
      activityId: row.activity_id,
      formationId: row.formation_id,
    };
  }

  async function readPassages(
    scope: ToolScope,
    input: ReadResourcesInput,
  ): Promise<{ passages: PassageResult[]; tokenCount: number; truncated: boolean }> {
    const formationId = input.formationId ?? scope.formationId;
    if (formationId === null) {
      throw new AppError('VALIDATION_FAILED', 'Une formation est nécessaire pour lire les apports.');
    }
    const rows = await tx.execute<{
      chunk_id: string;
      resource_id: string;
      title: string;
      text: string;
      score: string | number | null;
    }>(sql`
      select
        c.id::text as chunk_id,
        c.resource_id::text as resource_id,
        r.title,
        c.text,
        ts_rank(
          to_tsvector('simple', c.text),
          plainto_tsquery('simple', ${input.query})
        )::text as score
      from public.resource_chunks c
      join public.resources r on r.id = c.resource_id
      where r.formation_id = ${formationId}::uuid
        and r.deleted_at is null
        and r.status = 'ready'
        and (${input.chapterId ?? null}::uuid is null or r.chapter_id = ${input.chapterId ?? null}::uuid)
        and (
          ${input.moduleId ?? null}::uuid is null
          or exists (
            select 1 from public.chapters ch
            where ch.id = r.chapter_id and ch.module_id = ${input.moduleId ?? null}::uuid
          )
        )
        and (
          to_tsvector('simple', c.text) @@ plainto_tsquery('simple', ${input.query})
          or c.text ilike ${`%${escapeLike(input.query)}%`}
        )
      order by score desc, c.position asc, c.id asc
      limit ${input.limit}
    `);
    const budget = READ_RESOURCES_TOKEN_BUDGET[scope.task];
    const passages: PassageResult[] = [];
    let tokenCount = 0;
    let truncated = false;
    for (const row of rows) {
      const text =
        row.text.length > 8_000 ? `${row.text.slice(0, 8_000)}…` : row.text;
      const cost = Math.ceil(text.length / 4);
      if (tokenCount + cost > budget) {
        truncated = true;
        break;
      }
      tokenCount += cost;
      const score = safeScore(row.score);
      passages.push({
        chunkId: row.chunk_id,
        resourceId: row.resource_id,
        title: row.title,
        text,
        ...(score === null ? {} : { score }),
      });
    }
    return { passages, tokenCount, truncated };
  }

  async function searchWeb(
    scope: ToolScope,
    input: SearchWebInput,
  ): Promise<{ results: { title: string; url: string; snippet: string }[]; provider: string }> {
    if (ports.webSearch === undefined) {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'La recherche web n’est pas configurée pour cette tâche.',
      );
    }
    // The caller's guard restricts this port to the programme task; no result enters a course.
    return ports.webSearch.search({ query: input.query, maxResults: input.maxResults });
  }

  async function writeStructure(
    scope: ToolScope,
    input: CreateOrUpdateInput,
  ): Promise<{
    kind: 'module' | 'chapter' | 'notion' | 'notion_link' | 'brick';
    id: string;
    created: boolean;
    version?: number;
    fingerprint?: string | null;
  }> {
    const data = input.data;
    if (input.action === 'create') {
      if (data.kind === 'module') {
        const rows = await tx.execute<{ id: string }>(sql`
          insert into public.modules (
            formation_id, position, title, objectives, planned_start, planned_end, threshold
          ) values (
            ${input.formationId}::uuid,
            ${data.position},
            ${data.title},
            ${`{${data.objectives.join(',')}}`}::text[],
            ${data.plannedStart ?? null}::date,
            ${data.plannedEnd ?? null}::date,
            ${data.threshold ?? 80}
          )
          returning id::text as id
        `);
        const row = rows[0];
        if (row === undefined) throw new AppError('INTERNAL_ERROR', 'Module non créé.');
        return { kind: 'module', id: row.id, created: true };
      }
      if (data.kind === 'chapter') {
        const parent = await module(scope, data.moduleId);
        if (parent === null || parent.formationId !== input.formationId) {
          throw new AppError('NOT_FOUND', 'Élément introuvable.');
        }
        const rows = await tx.execute<{ id: string }>(sql`
          insert into public.chapters (module_id, formation_id, position, title)
          values (
            ${data.moduleId}::uuid, ${input.formationId}::uuid, ${data.position}, ${data.title}
          )
          returning id::text as id
        `);
        const row = rows[0];
        if (row === undefined) throw new AppError('INTERNAL_ERROR', 'Chapitre non créé.');
        return { kind: 'chapter', id: row.id, created: true };
      }
      if (data.kind === 'notion') {
        const parent = await chapter(scope, data.chapterId);
        if (parent === null || parent.formationId !== input.formationId) {
          throw new AppError('NOT_FOUND', 'Élément introuvable.');
        }
        const positionRows = await tx.execute<{ position: number }>(sql`
          select coalesce(max(position), 0) + 1 as position
          from public.notions where chapter_id = ${data.chapterId}::uuid
        `);
        const position = data.position ?? positionRows[0]?.position ?? 1;
        const rows = await tx.execute<{ id: string }>(sql`
          insert into public.notions (
            formation_id, module_id, chapter_id, label, short_definition, position, created_by
          ) values (
            ${input.formationId}::uuid,
            ${parent.moduleId}::uuid,
            ${data.chapterId}::uuid,
            ${data.label},
            ${data.shortDefinition ?? null},
            ${position},
            'tutor'
          )
          returning id::text as id
        `);
        const row = rows[0];
        if (row === undefined) throw new AppError('INTERNAL_ERROR', 'Notion non créée.');
        return { kind: 'notion', id: row.id, created: true };
      }
      if (data.kind === 'notion_link') {
        const from = await notion(scope, data.fromNotionId);
        const to = await notion(scope, data.toNotionId);
        if (
          from === null ||
          to === null ||
          from.formationId !== input.formationId ||
          to.formationId !== input.formationId
        ) {
          throw new AppError('NOT_FOUND', 'Élément introuvable.');
        }
        const rows = await tx.execute<{ id: string }>(sql`
          insert into public.notion_links (
            formation_id, from_notion_id, to_notion_id, kind, owner_id, rationale
          ) values (
            ${input.formationId}::uuid,
            ${data.fromNotionId}::uuid,
            ${data.toNotionId}::uuid,
            ${data.linkKind}::public.link_kind,
            ${scope.userId}::uuid,
            ${data.rationale ?? null}
          )
          returning id::text as id
        `);
        const row = rows[0];
        if (row === undefined) throw new AppError('INTERNAL_ERROR', 'Lien non créé.');
        return { kind: 'notion_link', id: row.id, created: true };
      }
      return writeBrick(scope, input, data.draft, null);
    }

    // Update: every target is locked and checked against the caller before a column changes.
    if (input.targetId === undefined) {
      throw new AppError('VALIDATION_FAILED', 'Identifiant cible manquant.');
    }
    if (data.kind === 'module') {
      const rows = await tx.execute<{ id: string }>(sql`
        update public.modules
        set title = ${data.title},
            objectives = ${`{${data.objectives.join(',')}}`}::text[],
            planned_start = ${data.plannedStart ?? null}::date,
            planned_end = ${data.plannedEnd ?? null}::date,
            threshold = ${data.threshold ?? 80},
            updated_at = now()
        where id = ${input.targetId}::uuid and formation_id = ${input.formationId}::uuid
        returning id::text as id
      `);
      if (rows[0] === undefined) throw new AppError('NOT_FOUND', 'Élément introuvable.');
      return { kind: 'module', id: rows[0].id, created: false };
    }
    if (data.kind === 'chapter') {
      const parent = await module(scope, data.moduleId);
      if (parent === null || parent.formationId !== input.formationId) {
        throw new AppError('NOT_FOUND', 'Élément introuvable.');
      }
      const rows = await tx.execute<{ id: string }>(sql`
        update public.chapters
        set module_id = ${data.moduleId}::uuid,
            position = ${data.position},
            title = ${data.title},
            updated_at = now()
        where id = ${input.targetId}::uuid and formation_id = ${input.formationId}::uuid
        returning id::text as id
      `);
      if (rows[0] === undefined) throw new AppError('NOT_FOUND', 'Élément introuvable.');
      return { kind: 'chapter', id: rows[0].id, created: false };
    }
    if (data.kind === 'notion') {
      const parent = await chapter(scope, data.chapterId);
      if (parent === null || parent.formationId !== input.formationId) {
        throw new AppError('NOT_FOUND', 'Élément introuvable.');
      }
      const rows = await tx.execute<{ id: string }>(sql`
        update public.notions
        set module_id = ${parent.moduleId}::uuid,
            chapter_id = ${data.chapterId}::uuid,
            label = ${data.label},
            short_definition = ${data.shortDefinition ?? null},
            position = coalesce(${data.position ?? null}::smallint, position),
            updated_at = now()
        where id = ${input.targetId}::uuid and formation_id = ${input.formationId}::uuid
        returning id::text as id
      `);
      if (rows[0] === undefined) throw new AppError('NOT_FOUND', 'Élément introuvable.');
      return { kind: 'notion', id: rows[0].id, created: false };
    }
    if (data.kind === 'notion_link') {
      throw new AppError('VALIDATION_FAILED', 'Un lien de notion ne se met pas à jour.');
    }
    return writeBrick(scope, input, data.draft, input.targetId);
  }

  async function writeBrick(
    scope: ToolScope,
    input: CreateOrUpdateInput,
    draft: Extract<CreateOrUpdateInput['data'], { kind: 'brick' }>['draft'],
    targetId: string | null,
  ): Promise<{
    kind: 'brick';
    id: string;
    created: boolean;
    version: number;
    fingerprint: string | null;
  }> {
    const resolver = {
      existingNotionIds: async (formationId: string, ids: string[]) => {
        const rows = await tx.execute<{ id: string }>(sql`
          select id::text as id from public.notions
          where formation_id = ${formationId}::uuid
            and id = any(${uuidArray(ids)}::uuid[])
        `);
        return new Set(rows.map((row) => row.id));
      },
      chunks: async (ids: string[]) => {
        const rows = await tx.execute<{ id: string; resource_id: string }>(sql`
          select c.id::text as id, c.resource_id::text as resource_id
          from public.resource_chunks c
          join public.resources r on r.id = c.resource_id
          where r.owner_id = ${scope.userId}::uuid
            and c.id = any(${uuidArray(ids)}::uuid[])
        `);
        return new Map(rows.map((row) => [row.id, { resourceId: row.resource_id }]));
      },
      resources: async (ids: string[]) => {
        const rows = await tx.execute<{
          id: string;
          kind: string;
          pages: number | null;
          duration_sec: number | null;
          deleted_at: Date | string | null;
        }>(sql`
          select
            id::text as id,
            kind::text as kind,
            (metadata->>'pages')::int as pages,
            (metadata->>'durationSec')::int as duration_sec,
            deleted_at
          from public.resources
          where owner_id = ${scope.userId}::uuid
            and id = any(${uuidArray(ids)}::uuid[])
        `);
        return new Map(
          rows.map((row) => [
            row.id,
            {
              kind: row.kind as
                | 'note'
                | 'pdf'
                | 'web'
                | 'youtube'
                | 'image'
                | 'audio'
                | 'video'
                | 'exam_guide',
              pages: row.pages,
              durationSec: row.duration_sec,
              deleted: row.deleted_at !== null,
            },
          ]),
        );
      },
      existingBrickIds: async (formationId: string, ids: string[]) => {
        const rows = await tx.execute<{ id: string }>(sql`
          select id::text as id from public.bricks
          where owner_id = ${scope.userId}::uuid
            and formation_id = ${formationId}::uuid
            and id = any(${uuidArray(ids)}::uuid[])
        `);
        return new Set(rows.map((row) => row.id));
      },
    };

    if (targetId === null) {
      const valid = await validateBrick({ ...draft, formationId: input.formationId }, resolver);
      if (!valid.ok) throw brickIssues(valid.error);
      const rows = await tx.execute<{ id: string }>(sql`
        insert into public.bricks (
          owner_id, formation_id, type, notion_ids, purpose, status, current_version
        ) values (
          ${scope.userId}::uuid,
          ${input.formationId}::uuid,
          ${valid.value.type}::public.brick_type,
          ${uuidArray(valid.value.notionIds)}::uuid[],
          ${valid.value.purpose}::public.brick_purpose,
          'active',
          1
        )
        returning id::text as id
      `);
      const brickRow = rows[0];
      if (brickRow === undefined) throw new AppError('INTERNAL_ERROR', 'Brique non créée.');
      await tx.execute(sql`
        insert into public.brick_versions (
          brick_id, version, payload, fingerprint, origin, created_by
        ) values (
          ${brickRow.id}::uuid,
          1,
          ${JSON.stringify(valid.value.payload)}::jsonb,
          ${valid.value.fingerprint},
          ${valid.value.origin}::public.content_origin,
          'tutor'
        )
      `);
      return {
        kind: 'brick',
        id: brickRow.id,
        created: true,
        version: 1,
        fingerprint: valid.value.fingerprint,
      };
    }

    const locked = await tx.execute<{
      id: string;
      status: string;
      current_version: number;
      version: number;
      payload: unknown;
      origin: string;
      type: string;
      purpose: string;
      notion_ids: string[];
    }>(sql`
      select
        b.id::text as id,
        b.status::text as status,
        b.current_version,
        v.version,
        v.payload,
        v.origin::text as origin,
        b.type::text as type,
        b.purpose::text as purpose,
        b.notion_ids::text[] as notion_ids
      from public.bricks b
      join public.brick_versions v on v.brick_id = b.id and v.version = b.current_version
      where b.id = ${targetId}::uuid
        and b.owner_id = ${scope.userId}::uuid
        and b.formation_id = ${input.formationId}::uuid
      for update of b
    `);
    const current = locked[0];
    if (current === undefined) throw new AppError('NOT_FOUND', 'Élément introuvable.');
    if (current.status === 'retired') {
      throw new AppError('BRICK_RETIRED', 'Cette brique a été retirée.');
    }
    if (input.expectedVersion !== undefined && input.expectedVersion !== current.current_version) {
      throw new AppError('CONFLICT', 'La brique a été modifiée entre-temps.');
    }
    const updateDraft = {
      type: draft.type,
      formationId: input.formationId,
      purpose: draft.purpose,
      notionIds: draft.notionIds,
      origin: draft.origin,
      payload: draft.payload,
    };
    const valid = await validateBrick(updateDraft, resolver);
    if (!valid.ok) throw brickIssues(valid.error);
    const nextVersion = current.current_version + 1;
    await tx.execute(sql`
      insert into public.brick_versions (
        brick_id, version, payload, fingerprint, origin, created_by
      ) values (
        ${targetId}::uuid,
        ${nextVersion},
        ${JSON.stringify(valid.value.payload)}::jsonb,
        ${valid.value.fingerprint},
        ${valid.value.origin}::public.content_origin,
        'tutor'
      )
    `);
    await tx.execute(sql`
      update public.bricks
      set current_version = ${nextVersion}, status = 'active'
      where id = ${targetId}::uuid
    `);
    return {
      kind: 'brick',
      id: targetId,
      created: false,
      version: nextVersion,
      fingerprint: valid.value.fingerprint,
    };
  }

  async function assembleActivity(
    scope: ToolScope,
    input: AssembleActivityInput,
  ): Promise<{ activityId: string; kind: string; status: 'draft' | 'ready'; itemCount: number }> {
    if (input.moduleId !== undefined) {
      const parent = await module(scope, input.moduleId);
      if (parent === null || parent.formationId !== input.formationId) {
        throw new AppError('NOT_FOUND', 'Élément introuvable.');
      }
    }
    const created = await createActivity(tx, {
      ownerId: scope.userId,
      formationId: input.formationId,
      moduleId: input.moduleId ?? null,
      kind: input.kind,
      ...(input.config === undefined ? {} : { config: input.config }),
      items: input.items.map((item) => ({
        brickId: item.brickId,
        brickVersionId: item.brickVersionId,
        ...(item.points === undefined ? {} : { points: item.points }),
      })),
      status: input.status,
      ...(input.forDate === undefined ? {} : { forDate: input.forDate }),
    });
    return {
      activityId: created.id,
      kind: created.kind,
      status: created.status === 'ready' ? 'ready' : 'draft',
      itemCount: created.items.length,
    };
  }

  async function schedule(
    scope: ToolScope,
    input: ScheduleInput,
  ): Promise<{ slotId: string; startsAt: string; endsAt: string; status: 'planned' }> {
    if (input.moduleId !== undefined) {
      const parent = await module(scope, input.moduleId);
      if (parent === null || parent.formationId !== input.formationId) {
        throw new AppError('NOT_FOUND', 'Élément introuvable.');
      }
    }
    if (input.activityId !== undefined) {
      const activityRef = await activity(scope, input.activityId);
      if (activityRef === null || activityRef.formationId !== input.formationId) {
        throw new AppError('NOT_FOUND', 'Élément introuvable.');
      }
    }
    const startsAt = new Date(input.startsAt);
    const endsAt = new Date(input.endsAt);
    const created = await createScheduleSlot(tx, {
      userId: scope.userId,
      formationId: input.formationId,
      moduleId: input.moduleId ?? null,
      kind: input.kind,
      title: input.title,
      meta: input.meta ?? null,
      startsAt,
      endsAt,
      activityId: input.activityId ?? null,
      createdBy: 'planner',
    });
    return {
      slotId: created.id,
      startsAt: created.startsAt.toISOString(),
      endsAt: created.endsAt.toISOString(),
      status: 'planned',
    };
  }

  async function slotOverlap(
    scope: ToolScope,
    startsAt: Date,
    endsAt: Date,
  ): Promise<boolean> {
    const rows = await tx.execute<{ id: string }>(sql`
      select id::text as id
      from public.schedule_slots
      where user_id = ${scope.userId}::uuid
        and status in ('planned', 'missed')
        and starts_at < ${endsAt.toISOString()}::timestamptz
        and ends_at > ${startsAt.toISOString()}::timestamptz
      limit 1
    `);
    return rows[0] !== undefined;
  }

  async function scheduleReminder(
    scope: ToolScope,
    input: ScheduleReminderInput,
  ): Promise<{ notificationId: string; scheduledFor: string; channels: ('email' | 'push')[] }> {
    const profileRows = await tx.execute<{
      timezone: string;
      quiet_start: string;
      quiet_end: string;
      channel_email: boolean;
      channel_push: boolean;
      max_per_day: number;
    }>(sql`
      select
        p.timezone,
        s.quiet_start::text as quiet_start,
        s.quiet_end::text as quiet_end,
        s.channel_email,
        s.channel_push,
        s.max_per_day
      from public.profiles p
      join public.notification_settings s on s.user_id = p.id
      where p.id = ${scope.userId}::uuid
    `);
    const profile = profileRows[0];
    if (profile === undefined) throw new AppError('NOT_FOUND', 'Profil introuvable.');
    const requested = new Date(input.at);
    const scheduledFor = nextOutsideQuietHours(requested, {
      start: profile.quiet_start.slice(0, 5),
      end: profile.quiet_end.slice(0, 5),
      timeZone: profile.timezone,
    });
    const channels: ('email' | 'push')[] = [];
    if (profile.channel_email) channels.push('email');
    if (profile.channel_push) channels.push('push');
    const day = userLocalDay(scheduledFor, profile.timezone);
    const bounds = userDayBounds(day, profile.timezone);
    const countRows = await tx.execute<{ count: number }>(sql`
      select count(*)::int as count
      from public.notification_deliveries d
      join public.notifications n on n.id = d.notification_id
      where n.user_id = ${scope.userId}::uuid
        and d.status in ('scheduled', 'sent')
        and d.scheduled_for >= ${bounds.start.toISOString()}::timestamptz
        and d.scheduled_for < ${bounds.end.toISOString()}::timestamptz
    `);
    const count = countRows[0]?.count ?? 0;
    if (count + channels.length > profile.max_per_day) {
      throw new AppError('CONFLICT', 'Le plafond quotidien de notifications est atteint.');
    }
    const created = await createNotification(tx, {
      userId: scope.userId,
      formationId: input.formationId ?? scope.formationId,
      type: 'relaunch',
      title: input.title,
      body: input.body,
      href: input.href,
      icon: 'clock',
      dedupeKey: input.dedupeKey ?? null,
      createdAt: scope.now,
    });
    // The external delivery journal is written by the notification service under the owner role
    // (SPEC-209); a learner transaction only creates the in-app notification. The quiet-hours and
    // cap checks above are still the normative guard of the tutor action.
    return {
      notificationId: created.notification.id,
      scheduledFor: scheduledFor.toISOString(),
      channels: created.created ? channels : [],
    };
  }

  async function getDueNotions(
    scope: ToolScope,
    input: GetDueNotionsInput,
  ): Promise<DueNotions> {
    const at = input.at === undefined ? scope.now : new Date(input.at);
    const rows = await tx.execute<{
      notion_id: string;
      label: string;
      chapter_id: string;
      module_id: string;
      module_position: number;
      module_status: string;
      evaluated: boolean;
      due_at: Date | string;
      mastery: string;
      gap_nature: string | null;
    }>(sql`
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
      left join public.module_progress mp
        on mp.user_id = ns.user_id and mp.module_id = m.id
      where ns.user_id = ${scope.userId}::uuid
        and n.formation_id = ${input.formationId}::uuid
        and ns.in_review
        and not ns.suspended
        and ns.due_at <= ${at.toISOString()}::timestamptz
      order by m.position, ns.due_at, n.position, n.id
    `);
    return DueNotionsSchema.parse({
      formationId: input.formationId,
      at: at.toISOString(),
      notions: rows.map((row) => ({
        notionId: row.notion_id,
        label: row.label,
        chapterId: row.chapter_id,
        moduleId: row.module_id,
        modulePosition: row.module_position,
        moduleStatus: row.module_status,
        evaluated: row.evaluated,
        dueAt: new Date(row.due_at).toISOString(),
        mastery: Number(row.mastery),
        gapNature: row.gap_nature,
      })),
      gaps: rows
        .filter((row) => row.gap_nature !== null)
        .map((row) => ({
          notionId: row.notion_id,
          nature: row.gap_nature as NonNullable<DueNotions['gaps'][number]['nature']>,
        })),
    });
  }

  async function readResults(
    scope: ToolScope,
    input: ReadResultsInput,
  ): Promise<{
    attempts: {
      attemptId: string;
      activityId: string;
      activityKind: string;
      status: string;
      score: number | null;
      passed: boolean | null;
      submittedAt: string | null;
    }[];
    states: {
      notionId: string;
      label: string;
      mastery: number;
      dueAt: string | null;
      gapNature: 'forgetting' | 'confusion' | 'misunderstanding' | 'application' | null;
    }[];
  }> {
    const attempts = await tx.execute<{
      attempt_id: string;
      activity_id: string;
      activity_kind: string;
      status: string;
      score: string | null;
      passed: boolean | null;
      submitted_at: Date | string | null;
    }>(sql`
      select
        a.id::text as attempt_id,
        a.activity_id::text as activity_id,
        act.kind::text as activity_kind,
        a.status::text as status,
        a.score::text as score,
        a.passed,
        a.submitted_at
      from public.attempts a
      join public.activities act on act.id = a.activity_id
      where a.user_id = ${scope.userId}::uuid
        and act.formation_id = ${input.formationId}::uuid
        and (${input.moduleId ?? null}::uuid is null or act.module_id = ${input.moduleId ?? null}::uuid)
      order by a.submitted_at desc nulls last, a.id desc
      limit ${input.limit}
    `);
    const states = await tx.execute<{
      notion_id: string;
      label: string;
      mastery: string;
      due_at: Date | string | null;
      gap_nature: string | null;
    }>(sql`
      select
        ns.notion_id::text as notion_id,
        n.label,
        ns.mastery::text as mastery,
        ns.due_at,
        ns.gap_nature::text as gap_nature
      from public.notion_states ns
      join public.notions n on n.id = ns.notion_id
      where ns.user_id = ${scope.userId}::uuid
        and n.formation_id = ${input.formationId}::uuid
      order by ns.due_at asc nulls last, n.position asc
      limit 20
    `);
    return {
      attempts: attempts.map((row) => ({
        attemptId: row.attempt_id,
        activityId: row.activity_id,
        activityKind: row.activity_kind,
        status: row.status,
        score: safeScore(row.score),
        passed: row.passed,
        submittedAt:
          row.submitted_at === null ? null : new Date(row.submitted_at).toISOString(),
      })),
      states: states.map((row) => ({
        notionId: row.notion_id,
        label: row.label,
        mastery: Number(row.mastery),
        dueAt: row.due_at === null ? null : new Date(row.due_at).toISOString(),
        gapNature: row.gap_nature as
          | 'forgetting'
          | 'confusion'
          | 'misunderstanding'
          | 'application'
          | null,
      })),
    };
  }

  async function gradeAnswer(
    scope: ToolScope,
    input: GradeAnswerInput,
  ): Promise<{
    answerId: string;
    score: number;
    maxScore: number;
    isCorrect: boolean;
    gradedBy: 'tutor';
  }> {
    const rows = await tx.execute<{
      answer_id: string;
      max_score: string | null;
      attempt_status: string;
    }>(sql`
      select
        a.id::text as answer_id,
        a.max_score::text as max_score,
        at.status::text as attempt_status
      from public.answers a
      join public.attempts at on at.id = a.attempt_id
      where a.attempt_id = ${input.attemptId}::uuid
        and a.position = ${input.position}
        and at.user_id = ${scope.userId}::uuid
      for update of a
    `);
    const answer = rows[0];
    if (answer === undefined) throw new AppError('NOT_FOUND', 'Élément introuvable.');
    if (answer.attempt_status !== 'submitted' && answer.attempt_status !== 'graded') {
      throw new AppError('CONFLICT', 'La tentative n’est pas encore soumise.');
    }
    const maxScore = answer.max_score === null ? input.maxScore : Number(answer.max_score);
    if (input.score > maxScore) {
      throw new AppError('VALIDATION_FAILED', 'La note dépasse le barème de la question.', {
        errors: [{ path: 'score', message: `score ≤ ${String(maxScore)} attendu` }],
      });
    }
    const updated = await tx.execute<{ id: string }>(sql`
      update public.answers
      set score = ${input.score}::numeric,
          max_score = ${maxScore}::numeric,
          is_correct = ${input.isCorrect},
          graded_by = 'tutor',
          feedback = ${JSON.stringify(input.feedback)}::jsonb,
          answered_at = answered_at
      where id = ${answer.answer_id}::uuid
      returning id::text as id
    `);
    const row = updated[0];
    if (row === undefined) throw new AppError('INTERNAL_ERROR', 'Réponse non corrigée.');
    return {
      answerId: row.id,
      score: input.score,
      maxScore,
      isCorrect: input.isCorrect,
      gradedBy: 'tutor',
    };
  }

  async function prepareQuestionBank(
    scope: ToolScope,
    input: PrepareQuestionBankInput,
  ): Promise<{
    requestId: string;
    accepted: true;
    notionIds: string[];
    format: PrepareQuestionBankInput['format'];
    count: number;
  }> {
    if (ports.questionBank === undefined) {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'La génération de banque de questions n’est pas encore branchée.',
      );
    }
    const requestId = scope.newId();
    await ports.questionBank.request({
      userId: scope.userId,
      formationId: input.formationId,
      notionIds: input.notionIds,
      format: input.format,
      count: input.count,
      requestId,
      now: scope.now,
    });
    return {
      requestId,
      accepted: true,
      notionIds: input.notionIds,
      format: input.format,
      count: input.count,
    };
  }

  async function bankCount(
    scope: ToolScope,
    notionIds: readonly string[],
    format: string,
  ): Promise<number> {
    const rows = await tx.execute<{ count: number }>(sql`
      select count(distinct b.id)::int as count
      from public.bricks b
      where b.owner_id = ${scope.userId}::uuid
        and b.status = 'active'
        and b.type = ${format}::public.brick_type
        and b.purpose = 'bank'
        and b.notion_ids && ${uuidArray(notionIds)}::uuid[]
    `);
    return rows[0]?.count ?? 0;
  }

  return {
    canAccessFormation,
    module,
    chapter,
    notion,
    brick,
    brickVersion,
    activity,
    attempt,
    readPassages,
    searchWeb,
    writeStructure,
    assembleActivity,
    schedule,
    slotOverlap,
    scheduleReminder,
    getDueNotions,
    readResults,
    gradeAnswer,
    prepareQuestionBank,
    bankCount,
  };
}

/** EF-4, BR-ACC-05 — the failure notice is written in the learner's tone, in French (BR-ACC-06). */
export function createDbNotifier(db: UserDatabase): {
  notifyInvalidOutput(scope: ToolScope, notice: InvalidOutputNotice): Promise<void>;
} {
  return {
    async notifyInvalidOutput(scope, notice) {
      const body =
        notice.tone === 'tu'
          ? 'Ta tâche IA n’a pas abouti. Choisis un autre modèle ou l’IA fournie dans tes paramètres.'
          : 'Votre tâche IA n’a pas abouti. Choisissez un autre modèle ou l’IA fournie dans vos paramètres.';
      await db.run(async (tx) => {
        await createNotification(tx, {
          userId: scope.userId,
          formationId: notice.formationId,
          type: 'ai_task_failed',
          title: 'Tâche IA interrompue',
          body,
          href: '/parametres/modeles-ia',
          icon: 'alert',
          dedupeKey: `ai_task_failed:${notice.task}:${notice.formationId ?? 'none'}`,
          createdAt: scope.now,
        });
      });
    },
  };
}

/** Test seam: a runtime that only answers ownership reads; writes throw explicitly. */
export function readOnlyRuntime(
  overrides: Partial<TutorToolRuntime> = {},
): TutorToolRuntime {
  const forbidden = (): Promise<never> =>
    Promise.reject(new AppError('FORBIDDEN', 'Action non autorisée dans ce contexte de démonstration.'));
  return {
    canAccessFormation: () => Promise.resolve(false),
    module: () => Promise.resolve(null),
    chapter: () => Promise.resolve(null),
    notion: () => Promise.resolve(null),
    brick: () => Promise.resolve(null),
    brickVersion: () => Promise.resolve(null),
    activity: () => Promise.resolve(null),
    attempt: () => Promise.resolve(null),
    readPassages: forbidden,
    searchWeb: forbidden,
    writeStructure: forbidden,
    assembleActivity: forbidden,
    schedule: forbidden,
    slotOverlap: () => Promise.resolve(false),
    scheduleReminder: forbidden,
    getDueNotions: forbidden,
    readResults: forbidden,
    gradeAnswer: forbidden,
    prepareQuestionBank: forbidden,
    bankCount: () => Promise.resolve(0),
    ...overrides,
  };
}
