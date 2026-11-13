// EF-3 — contributions without a blob: a note, a web page or a YouTube video (SPEC-206, SPEC-607).
//
// Same ownership, chapter and capacity rules as a file; the resource is created `queued` and never
// `ready` here: the ingestion (SPEC-509/510) is what makes it ready. A note is bounded to 100 000
// characters and answered with a business code, not a generic validation error. The
// `resource/uploaded` event is written in the same transaction (SPEC-607 ET-4): a rollback writes
// no event, a commit delivers it after the row exists.
import { CreateResourceBody, CreatedResource } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import { sql } from '@learny/db';
import { withTransaction } from '@learny/jobs';

import type { ServiceContext } from '../context';

import { uploadedEventId } from './deps';
import { assertCapacity, assertNoteText } from './limits';
import {
  chapterResourceCount,
  denyOrMissing,
  lockOwner,
  releaseExpiredReservations,
  selectChapterFormation,
  translateLimitError,
} from './queries';
import { requireUser, toResult } from './result';

const YOUTUBE_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be']);

function linkTitle(url: URL): string {
  return url.hostname.slice(0, 200);
}

export function createResource(
  ctx: ServiceContext,
  chapterId: string,
  body: CreateResourceBody,
): Promise<Result<CreatedResource>> {
  return toResult(async () => {
    const { userId, db } = requireUser(ctx);

    let title: string;
    let text: string | null = null;
    let url: string | null = null;
    if (body.kind === 'note') {
      assertNoteText(body.text);
      title = body.title;
      text = body.text;
    } else {
      const parsed = new URL(body.url);
      if (body.kind === 'youtube' && !YOUTUBE_HOSTS.has(parsed.hostname.toLowerCase())) {
        throw new AppError(
          'VALIDATION_FAILED',
          'Cette adresse n’est pas celle d’une vidéo YouTube.',
          {
            errors: [{ path: 'body.url', message: 'Adresse YouTube attendue.' }],
          },
        );
      }
      title = body.title ?? linkTitle(parsed);
      url = parsed.href;
    }

    try {
      return await withTransaction(
        db,
        async (tx, outbox): Promise<CreatedResource> => {
          await lockOwner(tx, userId);
          const chapter = await selectChapterFormation(tx, chapterId);
          if (chapter === null) return denyOrMissing('chapters', chapterId);
          await releaseExpiredReservations(tx, userId, ctx.clock.now());
          assertCapacity({
            chapterCount: await chapterResourceCount(tx, userId, chapterId),
            usedBytes: 0,
            addedBytes: 0,
          });
          const created = await tx.execute<{ id: string }>(sql`
            insert into public.resources (
              owner_id, formation_id, chapter_id, kind, title, content_text, url, status
            )
            values (
              ${userId}::uuid, ${chapter.formation_id}::uuid, ${chapterId}::uuid,
              ${body.kind}::public.resource_kind, ${title}, ${text}, ${url}, 'queued'
            )
            returning id::text as id
          `);
          const id = created[0]?.id;
          if (id === undefined) throw new Error('resource insert returned no row');
          outbox.add(
            'resource/uploaded',
            {
              userId,
              resourceId: id,
              formationId: chapter.formation_id,
              chapterId,
              kind: body.kind,
            },
            { id: uploadedEventId(id) },
          );
          return { id, kind: body.kind, status: 'queued', title };
        },
        { clock: ctx.clock, logger: ctx.logger },
      );
    } catch (error) {
      throw translateLimitError(error);
    }
  });
}
