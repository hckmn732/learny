// BR-APP-05 — import or dismiss a tutor suggestion (SPEC-607 EF-4, ET-5).
//
// A suggestion is a private resource row of the learner with `origin = tutor_suggestion` and a
// status `pending|imported|dismissed`. The learner's decision is explicit: importing creates a
// learner `web` contribution and enqueues `resource/uploaded` in the same transaction; dismissing
// creates nothing and emits nothing. The suggestion URL is never fetched by the browser: ingestion
// (SPEC-510) applies its anti-SSRF rules when the imported resource is processed.
import {
  type SuggestionDecisionOutput,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql, type DbTx } from '@learny/db';
import { withTransaction } from '@learny/jobs';

import type { ServiceContext } from '../context';

import { uploadedEventId } from './deps';
import { assertCapacity } from './limits';
import { chapterResourceCount, lockOwner } from './queries';
import { requireUser, toResult } from './result';

interface SuggestionRow extends Record<string, unknown> {
  id: string;
  title: string;
  url: string | null;
  chapter_id: string | null;
  formation_id: string;
  suggestion_status: string | null;
  module_status: string;
}

async function lockSuggestion(
  tx: DbTx,
  userId: string,
  suggestionId: string,
): Promise<SuggestionRow | null> {
  const rows = await tx.execute<SuggestionRow>(sql`
    select r.id::text as id,
           r.title,
           r.url,
           r.chapter_id::text as chapter_id,
           r.formation_id::text as formation_id,
           r.suggestion_status::text as suggestion_status,
           coalesce(mp.status, m.status)::text as module_status
    from public.resources r
    left join public.chapters c on c.id = r.chapter_id
    left join public.modules m on m.id = c.module_id
    left join public.module_progress mp
      on mp.module_id = m.id and mp.user_id = ${userId}::uuid
    where r.id = ${suggestionId}::uuid
      and r.owner_id = ${userId}::uuid
      and r.origin = 'tutor_suggestion'
      and r.deleted_at is null
    for update of r
  `);
  return rows[0] ?? null;
}

function unchanged(suggestion: SuggestionRow): SuggestionDecisionOutput {
  return {
    id: suggestion.id,
    status: suggestion.suggestion_status === 'dismissed' ? 'dismissed' : 'imported',
    resourceId: null,
  };
}

/** BR-APP-05 — import: one learner web resource, one event, suggestion marked imported. */
export function importSuggestion(
  ctx: ServiceContext,
  suggestionId: string,
): Promise<Result<SuggestionDecisionOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return withTransaction(
      db,
      async (tx, outbox): Promise<SuggestionDecisionOutput> => {
        const suggestion = await lockSuggestion(tx, userId, suggestionId);
        if (suggestion === null) throw new AppError('NOT_FOUND', 'Suggestion introuvable.');
        if (suggestion.suggestion_status === 'dismissed') {
          throw new AppError('CONFLICT', 'Cette suggestion a été ignorée.', { status: 409 });
        }
        if (suggestion.suggestion_status === 'imported') return unchanged(suggestion);
        if (suggestion.chapter_id === null || suggestion.url === null) {
          throw new AppError('CONFLICT', 'Cette suggestion n’a plus de chapitre ou d’adresse.');
        }
        if (suggestion.module_status === 'locked') {
          throw new AppError('FORBIDDEN', 'Ce module est verrouillé.');
        }

        await lockOwner(tx, userId);
        assertCapacity({
          chapterCount: await chapterResourceCount(tx, userId, suggestion.chapter_id),
          usedBytes: 0,
          addedBytes: 0,
        });
        const existing = await tx.execute<{ id: string }>(sql`
          select r.id::text as id
          from public.resources r
          where r.owner_id = ${userId}::uuid
            and r.chapter_id = ${suggestion.chapter_id}::uuid
            and r.origin = 'learner'
            and r.kind = 'web'
            and r.url = ${suggestion.url}
            and r.deleted_at is null
          limit 1
        `);
        let resourceId = existing[0]?.id;
        if (resourceId === undefined) {
          const created = await tx.execute<{ id: string }>(sql`
            insert into public.resources (
              owner_id, formation_id, chapter_id, kind, title, url, status
            )
            values (
              ${userId}::uuid,
              ${suggestion.formation_id}::uuid,
              ${suggestion.chapter_id}::uuid,
              'web',
              ${suggestion.title},
              ${suggestion.url},
              'queued'
            )
            returning id::text as id
          `);
          resourceId = created[0]?.id;
          if (resourceId === undefined) {
            throw new AppError('INTERNAL_ERROR', 'La suggestion n’a pas pu être importée.');
          }
          outbox.add(
            'resource/uploaded',
            {
              userId,
              resourceId,
              formationId: suggestion.formation_id,
              chapterId: suggestion.chapter_id,
              kind: 'web',
            },
            { id: uploadedEventId(resourceId) },
          );
        }

        await tx.execute(sql`
          update public.resources
          set suggestion_status = 'imported',
              updated_at = ${ctx.clock.now().toISOString()}::timestamptz
          where id = ${suggestion.id}::uuid and owner_id = ${userId}::uuid
        `);
        return { id: suggestion.id, status: 'imported', resourceId };
      },
      { clock: ctx.clock, logger: ctx.logger },
    );
  });
}

/** BR-APP-05 — dismiss: the suggestion leaves the list, no contribution exists. */
export function dismissSuggestion(
  ctx: ServiceContext,
  suggestionId: string,
): Promise<Result<SuggestionDecisionOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return withTransaction(
      db,
      async (tx): Promise<SuggestionDecisionOutput> => {
        const suggestion = await lockSuggestion(tx, userId, suggestionId);
        if (suggestion === null) throw new AppError('NOT_FOUND', 'Suggestion introuvable.');
        if (suggestion.suggestion_status === 'imported') {
          throw new AppError('CONFLICT', 'Cette suggestion a déjà été importée.', { status: 409 });
        }
        if (suggestion.suggestion_status !== 'dismissed') {
          await tx.execute(sql`
            update public.resources
            set suggestion_status = 'dismissed',
                updated_at = ${ctx.clock.now().toISOString()}::timestamptz
            where id = ${suggestion.id}::uuid and owner_id = ${userId}::uuid
          `);
        }
        return { id: suggestion.id, status: 'dismissed', resourceId: null };
      },
      { clock: ctx.clock, logger: ctx.logger },
    );
  });
}
