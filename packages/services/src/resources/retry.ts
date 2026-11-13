// BR-APP-07 — retry a failed contribution (SPEC-607 EF-3).
//
// One transaction row-locks the resource, moves `failed` to `queued`, clears the readable error and
// enqueues a fresh `resource/uploaded` event after commit. The event identifier carries the retry
// number, so two concurrent clicks produce one event while a later failure can be retried again.
// `queued`, `processing` and `ready` are returned unchanged: a repeat never duplicates an effect.
import type { ResourceKind, RetryResourceOutput, ResourceStatus } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql } from '@learny/db';
import { withTransaction } from '@learny/jobs';

import type { ServiceContext } from '../context';

import { uploadedEventId } from './deps';
import { requireUser, toResult } from './result';

interface RetryRow extends Record<string, unknown> {
  id: string;
  formation_id: string;
  chapter_id: string | null;
  kind: ResourceKind;
  status: string;
  error_code: string | null;
  error_message: string | null;
  metadata: { ingestion?: { attempts?: number } };
  updated_at: Date | string;
}

function isoOf(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function dto(row: RetryRow): RetryResourceOutput {
  return {
    id: row.id,
    status: row.status as ResourceStatus,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    updatedAt: isoOf(row.updated_at),
  };
}

export function retryResource(
  ctx: ServiceContext,
  resourceId: string,
): Promise<Result<RetryResourceOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    return withTransaction(
      db,
      async (tx, outbox): Promise<RetryResourceOutput> => {
        const rows = await tx.execute<RetryRow>(sql`
          select r.id::text as id,
                 r.formation_id::text as formation_id,
                 r.chapter_id::text as chapter_id,
                 r.kind::text as kind,
                 r.status::text as status,
                 r.error_code,
                 r.error_message,
                 r.metadata,
                 r.updated_at
          from public.resources r
          where r.id = ${resourceId}::uuid
            and r.owner_id = ${userId}::uuid
            and r.deleted_at is null
          for update
        `);
        const row = rows[0];
        if (row === undefined) {
          throw new AppError('NOT_FOUND', 'Apport introuvable.');
        }
        if (row.status !== 'failed') return dto(row);

        const now = ctx.clock.now();
        const retry = (row.metadata.ingestion?.attempts ?? 0) + 1;
        const updated = await tx.execute<RetryRow>(sql`
          update public.resources r
          set status = 'queued',
              error_code = null,
              error_message = null,
              updated_at = ${now.toISOString()}::timestamptz
          where r.id = ${resourceId}::uuid
            and r.owner_id = ${userId}::uuid
            and r.deleted_at is null
            and r.status = 'failed'
          returning r.id::text as id,
                    r.formation_id::text as formation_id,
                    r.chapter_id::text as chapter_id,
                    r.kind::text as kind,
                    r.status::text as status,
                    r.error_code,
                    r.error_message,
                    r.metadata,
                    r.updated_at
        `);
        const result = updated[0];
        if (result === undefined) {
          // Another request won the transition: return its state, without a second event.
          const current = await tx.execute<RetryRow>(sql`
            select r.id::text as id,
                   r.formation_id::text as formation_id,
                   r.chapter_id::text as chapter_id,
                   r.kind::text as kind,
                   r.status::text as status,
                   r.error_code,
                   r.error_message,
                   r.metadata,
                   r.updated_at
            from public.resources r
            where r.id = ${resourceId}::uuid and r.owner_id = ${userId}::uuid
          `);
          const fresh = current[0];
          if (fresh === undefined) throw new AppError('NOT_FOUND', 'Apport introuvable.');
          return dto(fresh);
        }

        outbox.add(
          'resource/uploaded',
          {
            userId,
            resourceId: result.id,
            formationId: result.formation_id,
            chapterId: result.chapter_id,
            kind: result.kind,
          },
          { id: `${uploadedEventId(result.id)}:retry-${String(retry)}` },
        );
        return dto(result);
      },
      { clock: ctx.clock, logger: ctx.logger },
    );
  });
}
