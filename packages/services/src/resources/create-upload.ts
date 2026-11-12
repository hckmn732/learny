// EF-1 — reserves a file contribution and signs its upload (SPEC-206).
//
// One transaction, serialised per user: it checks the chapter, releases the reservations that
// expired, counts the chapter and the quota (finalized bytes plus live reservations), inserts the
// `queued` resource with its reservation window and signs the upload URL of
// `<userId>/<resourceId>/<name>`. A signature failure rolls the reservation back. The URL is
// returned, never stored: a retry with the same `Idempotency-Key` signs a fresh one for the same
// resource instead of reading a stored response (ET-4).
import { randomUUID } from 'node:crypto';

import type { CreateUploadBody, CreateUploadOutput } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import {
  SIGNED_URL_TTL_MS,
  createUploadUrl,
  normalizeStorageFileName,
  resourcePath,
  sql,
  type DbTx,
} from '@learny/db';

import type { ServiceContext } from '../context';

import type { ResourceDeps } from './deps';
import { assertCapacity, assertDeclaredUpload } from './limits';
import {
  chapterResourceCount,
  denyOrMissing,
  findByIdempotencyKey,
  lockOwner,
  releaseExpiredReservations,
  selectChapterFormation,
  translateLimitError,
  usedBytes,
  type ResourceRow,
} from './queries';
import { requireUser, toResult } from './result';

export type CreateUploadInput = CreateUploadBody & { idempotencyKey: string };

function stripExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  return base === '' ? name : base;
}

function normalizedMime(mime: string): string {
  return (mime.split(';')[0] ?? '').trim().toLowerCase();
}

export function createUpload(
  ctx: ServiceContext,
  deps: ResourceDeps,
  chapterId: string,
  input: CreateUploadInput,
): Promise<Result<CreateUploadOutput>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);
    // Declared type and size are refused before anything is reserved (CL-1 to CL-3, ET-7).
    const kind = assertDeclaredUpload({ mime: input.mime, sizeBytes: input.sizeBytes });
    const resourceId = randomUUID();
    const path = resourcePath(userId, resourceId, input.fileName);
    const cleanName = normalizeStorageFileName(input.fileName);
    const now = ctx.clock.now();
    const reservedUntil = new Date(now.getTime() + SIGNED_URL_TTL_MS).toISOString();
    const runtime = (tx: DbTx) => ({ db: tx, gateway: deps.gateway, clock: ctx.clock });
    const access = { userId, accessToken: deps.accessToken(userId), role: 'user' as const };

    try {
      return await db.run(async (tx): Promise<CreateUploadOutput> => {
        await lockOwner(tx, userId);
        const chapter = await selectChapterFormation(tx, chapterId);
        if (chapter === null) return denyOrMissing('chapters', chapterId);

        const replayed = await findByIdempotencyKey(tx, userId, input.idempotencyKey);
        if (replayed !== null) {
          return replay(tx, replayed, input, chapterId, cleanName, reservedUntil, (target) =>
            sign(runtime(tx), access, target),
          );
        }

        await releaseExpiredReservations(tx, userId, now);
        assertCapacity({
          chapterCount: await chapterResourceCount(tx, userId, chapterId),
          usedBytes: await usedBytes(tx, userId, now),
          addedBytes: input.sizeBytes,
        });

        const metadata = {
          upload: {
            declaredBytes: input.sizeBytes,
            declaredMime: normalizedMime(input.mime),
            reservedUntil,
            idempotencyKey: input.idempotencyKey,
          },
        };
        await tx.execute(sql`
          insert into public.resources (
            id, owner_id, formation_id, chapter_id, kind, title, storage_path, status, metadata
          )
          values (
            ${resourceId}::uuid, ${userId}::uuid, ${chapter.formation_id}::uuid, ${chapterId}::uuid,
            ${kind}::public.resource_kind, ${input.title ?? stripExtension(cleanName)}, ${path},
            'queued', ${JSON.stringify(metadata)}::jsonb
          )
        `);
        const signed = await sign(runtime(tx), access, path);
        return { resourceId, uploadUrl: signed.url, expiresAt: signed.expiresAt.toISOString() };
      });
    } catch (error) {
      throw translateLimitError(error);
    }
  });
}

type SignRuntime = { db: DbTx; gateway: ResourceDeps['gateway']; clock: ServiceContext['clock'] };

function sign(
  runtime: SignRuntime,
  access: { userId: string; accessToken: string; role: 'user' },
  path: string,
) {
  return createUploadUrl(runtime, access, { bucket: 'resources', path });
}

/**
 * ET-4 — the same key and the same request return the same resource with a freshly signed URL and a
 * reservation window that covers it; the same key for another request is refused.
 */
async function replay(
  tx: DbTx,
  existing: ResourceRow,
  input: CreateUploadInput,
  chapterId: string,
  cleanName: string,
  reservedUntil: string,
  signPath: (path: string) => ReturnType<typeof sign>,
): Promise<CreateUploadOutput> {
  const upload = existing.metadata.upload ?? {};
  const storedName = existing.storage_path?.split('/')[2];
  const same =
    existing.chapter_id === chapterId &&
    upload.declaredBytes === input.sizeBytes &&
    upload.declaredMime === normalizedMime(input.mime) &&
    storedName === cleanName;
  if (!same || existing.storage_path === null) {
    throw new AppError(
      'IDEMPOTENCY_KEY_REUSED',
      'Cette clé d’idempotence a déjà servi pour un autre envoi.',
    );
  }
  if (existing.size_bytes !== null) {
    throw new AppError('CONFLICT', 'Cet envoi est déjà finalisé : il n’y a rien à reprendre.');
  }
  const refreshed = { ...existing.metadata, upload: { ...upload, reservedUntil } };
  await tx.execute(sql`
    update public.resources
    set metadata = ${JSON.stringify(refreshed)}::jsonb
    where id = ${existing.id}::uuid
  `);
  const signed = await signPath(existing.storage_path);
  return {
    resourceId: existing.id,
    uploadUrl: signed.url,
    expiresAt: signed.expiresAt.toISOString(),
  };
}
