// EF-2 — finalizes a file contribution from the bytes that were really uploaded (SPEC-206).
//
// 1. The object is measured and read through Storage under the caller's identity; the real type is
//    read from its signature and the PDF pages are counted (ET-2).
// 2. One transaction, serialised per user and row-locked, re-checks the chapter and quota with the
//    measured size, then records `mime`, `size_bytes` and the fingerprint (ET-3, ET-5).
// 3. After commit, `resource/uploaded` is sent once (uploaded-event.ts).
// A refused upload (type, size, pages, quota) is discarded: its blob is removed and its slot is
// freed. A missing or truncated object is only reported, so the client can finish its upload.
import type { FinalizedResource, UploadFileKind } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql } from '@learny/db';

import type { ServiceContext } from '../context';

import { removeBlob } from './blob';
import type { ResourceDeps } from './deps';
import { detectUpload } from './detect';
import { assertCapacity, assertFileSize, sizeLimitBytes } from './limits';
import {
  chapterResourceCount,
  denyOrMissing,
  discardResource,
  lockOwner,
  releaseExpiredReservations,
  selectResource,
  translateLimitError,
  usedBytes,
  type ResourceRow,
} from './queries';
import { requireUser, toResult } from './result';
import { fingerprint } from './storage';
import { ensureUploadedEvent } from './uploaded-event';

const DISCARDING_CODES = new Set(['UPLOAD_TOO_LARGE', 'UNSUPPORTED_TYPE', 'QUOTA_EXCEEDED']);

function toKind(row: ResourceRow): UploadFileKind {
  if (row.kind !== 'pdf' && row.kind !== 'image') {
    throw new AppError('CONFLICT', 'Cet apport n’attend pas de fichier.');
  }
  return row.kind;
}

function toDto(row: ResourceRow): FinalizedResource {
  return {
    id: row.id,
    kind: toKind(row),
    status: row.status as FinalizedResource['status'],
    mime: row.mime ?? '',
    sizeBytes: row.size_bytes ?? 0,
    pages: row.metadata.pages ?? null,
  };
}

function incomplete(message: string): AppError {
  return new AppError('UPLOAD_INCOMPLETE', message);
}

export function finalizeUpload(
  ctx: ServiceContext,
  deps: ResourceDeps,
  resourceId: string,
): Promise<Result<FinalizedResource>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    const row = await db.run((tx) => selectResource(tx, resourceId));
    if (row === null) return denyOrMissing('resources', resourceId);
    if (row.deleted_at !== null) {
      throw new AppError('NOT_FOUND', 'Cet envoi a expiré ou a été supprimé : recommencez-le.');
    }
    const kind = toKind(row);
    const path = row.storage_path;
    if (path === null || row.metadata.upload === undefined) {
      throw new AppError('CONFLICT', 'Cet apport n’attend pas de fichier.');
    }
    const token = deps.accessToken(userId);

    // ET-5 — a second call returns the same state, unless the object changed since.
    if (row.size_bytes !== null) {
      const current = await deps.reader.info('resources', path, token);
      const stored = row.metadata.upload;
      if (current?.etag !== stored.etag || current?.size !== row.size_bytes) {
        throw new AppError(
          'CONFLICT',
          'Le fichier a changé depuis sa finalisation : envoyez-le de nouveau.',
        );
      }
      await ensureUploadedEvent(ctx, deps, db, row);
      return toDto(row);
    }

    const discard = async (error: unknown): Promise<never> => {
      if (error instanceof AppError && DISCARDING_CODES.has(error.code)) {
        await db.run((tx) => discardResource(tx, row.id, ctx.clock.now()));
        await removeBlob(ctx, deps, { resourceId: row.id, ownerId: userId, path });
      }
      throw error;
    };

    // CL-6 — absent or truncated object: refuse, keep the reservation until it expires.
    const info = await deps.reader.info('resources', path, token);
    if (info === null || info.size === 0) {
      throw incomplete(
        'Le fichier n’a pas été reçu : envoyez-le à l’adresse fournie avant de finaliser.',
      );
    }
    if (info.size < (row.metadata.upload.declaredBytes ?? 0)) {
      throw incomplete(
        `Le fichier reçu est incomplet (${String(info.size)} octets sur ${String(row.metadata.upload.declaredBytes ?? 0)} annoncés) : renvoyez-le.`,
      );
    }
    let measured: Awaited<ReturnType<typeof detectUpload>>;
    let digest: string;
    let etag: string;
    try {
      assertFileSize(kind, info.size);
      const content = await deps.reader.read('resources', path, token, sizeLimitBytes(kind));
      if (content === null) throw incomplete('Le fichier a disparu avant d’être lu : renvoyez-le.');
      if (content.bytes.length !== info.size) {
        throw new AppError('CONFLICT', 'Le fichier a changé pendant sa lecture : renvoyez-le.');
      }
      measured = await detectUpload(content.bytes, kind);
      digest = fingerprint(content.bytes);
      etag = content.etag;
    } catch (error) {
      return discard(error);
    }

    const sizeBytes = info.size;
    let committed: { row: ResourceRow };
    try {
      committed = await db.run(async (tx) => {
        await lockOwner(tx, userId);
        const locked = await selectResource(tx, resourceId, { forUpdate: true });
        if (locked === null || locked.deleted_at !== null) {
          throw new AppError('NOT_FOUND', 'Cet envoi a expiré : recommencez-le.');
        }
        // CL-4 — another finalization won the race: same state, nothing counted twice.
        if (locked.size_bytes !== null) return { row: locked };

        const now = ctx.clock.now();
        await releaseExpiredReservations(tx, userId, now, resourceId);
        if (locked.chapter_id !== null) {
          assertCapacity({
            chapterCount: await chapterResourceCount(tx, userId, locked.chapter_id, resourceId),
            usedBytes: await usedBytes(tx, userId, now, resourceId),
            addedBytes: sizeBytes,
          });
        }
        const metadata = {
          ...locked.metadata,
          ...(measured.pages === null ? {} : { pages: measured.pages }),
          upload: {
            ...locked.metadata.upload,
            finalizedAt: now.toISOString(),
            sha256: digest,
            etag,
          },
        };
        const updated = await tx.execute<ResourceRow>(sql`
          update public.resources r
          set mime = ${measured.mime},
              size_bytes = ${sizeBytes},
              metadata = ${JSON.stringify(metadata)}::jsonb
          where r.id = ${resourceId}::uuid and r.owner_id = ${userId}::uuid
            and r.deleted_at is null and r.size_bytes is null
          returning
            r.id::text as id, r.owner_id::text as owner_id, r.formation_id::text as formation_id,
            r.chapter_id::text as chapter_id, r.kind::text as kind, r.title, r.storage_path,
            r.mime, r.size_bytes::float8 as size_bytes, r.status::text as status, r.metadata,
            r.deleted_at, r.updated_at
        `);
        const result = updated[0];
        if (result === undefined) {
          throw new AppError('CONFLICT', 'L’envoi a été modifié en parallèle : réessayez.');
        }
        return { row: result };
      });
    } catch (error) {
      return discard(translateLimitError(error));
    }

    await ensureUploadedEvent(ctx, deps, db, committed.row);
    return toDto(committed.row);
  });
}
