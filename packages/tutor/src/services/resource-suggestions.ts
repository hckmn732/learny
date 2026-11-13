// Resource suggestions of the tutor (SPEC-512 CA-4; BR-APP-05).
//
// A search result never becomes a course fragment. It can become a `resources` row with
// `origin = tutor_suggestion` and `suggestion_status = pending`; the learner then imports it into
// the chapter or dismisses it. The service runs with the caller's RLS client, so one learner can
// never read or decide the suggestion of another. Creating the same canonical URL twice for the
// same chapter returns the existing suggestion (idempotent replay).
import {
  ResourceSuggestion,
  ResourceSuggestionDecision,
  ResourceSuggestionInput,
  type ResourceSuggestionStatus,
} from '@learny/contracts';
import {
  AppError,
  clock as systemClock,
  err,
  ok,
  type Clock,
  type LearnyLogger,
  type Result,
} from '@learny/core';
import { sql, type UserDatabase } from '@learny/db';
import { canonicalizeUrl, isPublicHttpUrl } from '@learny/llm';

export interface ResourceSuggestionContext {
  userId: string;
  /** RLS client of the learner; never the service-role client. */
  db: UserDatabase;
  logger?: LearnyLogger;
  clock?: Clock;
}

interface SuggestionRow {
  [key: string]: unknown;
  id: string;
  chapter_id: string;
  title: string;
  url: string;
  reason: string | null;
  status: string;
  created_at: string;
}

const SELECT_COLUMNS = sql`id::text as id, chapter_id::text as chapter_id, title, url,
  metadata ->> 'suggestionReason' as reason, suggestion_status::text as status,
  to_json(created_at) #>> '{}' as created_at`;

function invalidInput(message: string, path: string): AppError {
  return new AppError('VALIDATION_FAILED', 'Les données envoyées sont invalides.', {
    status: 400,
    errors: [{ path, message }],
  });
}

function readStatus(value: string): ResourceSuggestionStatus {
  return value === 'imported' || value === 'dismissed' ? value : 'pending';
}

function toSuggestion(row: SuggestionRow, duplicate: boolean): Result<ResourceSuggestion> {
  const parsed = ResourceSuggestion.safeParse({
    id: row.id,
    chapterId: row.chapter_id,
    title: row.title,
    url: row.url,
    reason: row.reason ?? 'Ressource suggérée par le tuteur.',
    status: readStatus(row.status),
    createdAt: new Date(row.created_at).toISOString(),
    duplicate,
  });
  if (!parsed.success) {
    return err(
      new AppError('INVALID_RESPONSE', 'La suggestion de ressource est incohérente.', {
        status: 502,
      }),
    );
  }
  return ok(parsed.data);
}

/**
 * BR-APP-05 — records a pending suggestion for one chapter. The URL is canonicalized first; a
 * second call with the same canonical URL returns the existing row with `duplicate: true`.
 */
export async function suggestResource(
  ctx: ResourceSuggestionContext,
  rawInput: unknown,
): Promise<Result<ResourceSuggestion>> {
  if (rawInput === null || typeof rawInput !== 'object') {
    return err(invalidInput('Une suggestion est attendue.', 'body'));
  }
  const url = (rawInput as { url?: unknown }).url;
  const canonical = typeof url === 'string' ? canonicalizeUrl(url) : null;
  if (canonical === null || !isPublicHttpUrl(canonical)) {
    return err(invalidInput('Une URL HTTP(S) publique est attendue.', 'url'));
  }
  const parsed = ResourceSuggestionInput.safeParse({ ...rawInput, url: canonical });
  if (!parsed.success) {
    return err(invalidInput(parsed.error.issues[0]?.message ?? 'Suggestion invalide.', 'body'));
  }
  const input = parsed.data;
  const now = (ctx.clock ?? systemClock).now();

  return ctx.db.run(async (tx): Promise<Result<ResourceSuggestion>> => {
    const chapter = await tx.execute<{ formation_id: string }>(sql`
      select c.formation_id::text as formation_id
      from public.chapters c
      join public.formations f on f.id = c.formation_id
      where c.id = ${input.chapterId}::uuid and f.owner_id = ${ctx.userId}::uuid
      limit 1
    `);
    const formationId = chapter[0]?.formation_id;
    if (formationId === undefined) {
      return err(new AppError('NOT_FOUND', 'Ce chapitre est introuvable.', { status: 404 }));
    }

    const existing = await tx.execute<SuggestionRow>(sql`
      select ${SELECT_COLUMNS}
      from public.resources
      where owner_id = ${ctx.userId}::uuid
        and chapter_id = ${input.chapterId}::uuid
        and origin = 'tutor_suggestion'
        and deleted_at is null
        and url = ${input.url}
      order by created_at
      limit 1
    `);
    if (existing[0] !== undefined) {
      return toSuggestion(existing[0], true);
    }

    const inserted = await tx.execute<SuggestionRow>(sql`
      insert into public.resources (
        owner_id, formation_id, chapter_id, kind, origin, suggestion_status, title, url, status,
        metadata, created_at, updated_at
      )
      values (
        ${ctx.userId}::uuid, ${formationId}::uuid, ${input.chapterId}::uuid, 'web',
        'tutor_suggestion', 'pending', ${input.title}, ${input.url}, 'queued',
        ${JSON.stringify({ suggestionReason: input.reason })}::jsonb, ${now.toISOString()}::timestamptz, ${now.toISOString()}::timestamptz
      )
      returning ${SELECT_COLUMNS}
    `);
    const row = inserted[0];
    if (row === undefined) {
      return err(new AppError('INTERNAL_ERROR', 'La suggestion n’a pas pu être enregistrée.'));
    }
    ctx.logger?.info('resource suggested', {
      operation: 'resource_suggestion',
      resultCount: 1,
    });
    return toSuggestion(row, false);
  });
}

/**
 * BR-APP-05, CA-4 — applies the learner's explicit decision. Only a pending suggestion of the
 * caller can change; a replay of the same decision returns the current state, a conflicting one is
 * a `CONFLICT`. No course, section or citation is created here.
 */
export async function decideResourceSuggestion(
  ctx: ResourceSuggestionContext,
  suggestionId: string,
  rawDecision: unknown,
): Promise<Result<ResourceSuggestion>> {
  const decision = ResourceSuggestionDecision.safeParse(rawDecision);
  if (!decision.success)
    return err(invalidInput('Décision attendue : import ou dismiss.', 'decision'));
  const target: ResourceSuggestionStatus = decision.data === 'import' ? 'imported' : 'dismissed';
  const now = (ctx.clock ?? systemClock).now();

  return ctx.db.run(async (tx): Promise<Result<ResourceSuggestion>> => {
    const updated = await tx.execute<SuggestionRow>(sql`
      update public.resources
      set suggestion_status = ${target}::public.suggestion_status, updated_at = ${now.toISOString()}::timestamptz
      where id = ${suggestionId}::uuid
        and owner_id = ${ctx.userId}::uuid
        and origin = 'tutor_suggestion'
        and suggestion_status = 'pending'
        and deleted_at is null
      returning ${SELECT_COLUMNS}
    `);
    if (updated[0] !== undefined) return toSuggestion(updated[0], false);

    const current = await tx.execute<SuggestionRow>(sql`
      select ${SELECT_COLUMNS}
      from public.resources
      where id = ${suggestionId}::uuid
        and owner_id = ${ctx.userId}::uuid
        and origin = 'tutor_suggestion'
        and deleted_at is null
      limit 1
    `);
    const row = current[0];
    if (row === undefined) {
      return err(new AppError('NOT_FOUND', 'Cette suggestion est introuvable.', { status: 404 }));
    }
    if (readStatus(row.status) === target) return toSuggestion(row, true);
    return err(
      new AppError('CONFLICT', 'Cette suggestion a déjà reçu une autre décision.', { status: 409 }),
    );
  });
}

/** Pending and decided suggestions of a chapter, newest first; RLS keeps it owner-only. */
export async function listResourceSuggestions(
  ctx: ResourceSuggestionContext,
  chapterId: string,
): Promise<Result<ResourceSuggestion[]>> {
  return ctx.db.run(async (tx) => {
    const rows = await tx.execute<SuggestionRow>(sql`
      select ${SELECT_COLUMNS}
      from public.resources
      where owner_id = ${ctx.userId}::uuid
        and chapter_id = ${chapterId}::uuid
        and origin = 'tutor_suggestion'
        and deleted_at is null
      order by created_at desc
    `);
    const suggestions: ResourceSuggestion[] = [];
    for (const row of rows) {
      const suggestion = toSuggestion(row, false);
      if (!suggestion.ok) return suggestion;
      suggestions.push(suggestion.value);
    }
    return ok(suggestions);
  });
}
