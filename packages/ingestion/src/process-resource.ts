// Ingestion of a note or a private PDF (SPEC-509 EF-1 to EF-5, ET-1 to ET-5).
//
// One run goes through five durable stages: load the owned resource, extract its text, split it
// into located passages, embed every passage, then finalize. Only the finalization writes: the
// previous passages are replaced in one transaction after every passage is ready (ET-3), so a
// failure never leaves a partial set. A duplicate delivery finds the completed marker and does
// nothing; a transient provider outage leaves the resource `processing` for the next attempt
// (CL-3); a permanent extraction failure ends in `failed` with a readable code (BR-APP-07).
import { createHash } from 'node:crypto';

import { IngestionOutcome, ProcessResourceInput } from '@learny/contracts';
import type { IngestionErrorCode } from '@learny/contracts';
import { AppError, type Clock, type LearnyLogger } from '@learny/core';
import { sql, type Db } from '@learny/db';

import { chunkText } from './chunk';
import { defaultIngestionDeps, type IngestionDeps, type IngestionEvents } from './deps';
import { embedTexts, EMBEDDING_MODEL, toVectorLiteral } from './embeddings';
import { IngestionError, isIngestionError, sourceMissing } from './errors';
import { createLlmVisionReader, extractImageDocument } from './extract/image';
import { extractNote } from './extract/note';
import { extractPdf } from './extract/pdf';
import { IMAGE_LIMITS } from './extract/remote';
import type { ExtractedContent } from './extract/types';
import { extractWebDocument } from './extract/web';
import { extractYoutube, youtubeContent } from './extract/youtube';

export const INGESTION_EVENT_CLAIM_STALE_MS = 60_000;
const CHUNK_INSERT_BATCH = 50;

export interface StepRunner {
  run<T>(name: string, fn: () => Promise<T>): Promise<T>;
}

export interface IngestionContext {
  /** Owner-role client: the job is an explicitly authorized system operation (ET-4). */
  sdb: Db;
  clock: Clock;
  logger: LearnyLogger;
  requestId: string;
  /** Inngest steps when the run is a job; absent for a direct service call. */
  step?: StepRunner;
}

interface ResourceRow extends Record<string, unknown> {
  id: string;
  owner_id: string;
  formation_id: string;
  chapter_id: string | null;
  kind: string;
  title: string;
  content_text: string | null;
  storage_path: string | null;
  url: string | null;
  mime: string | null;
  size_bytes: number | null;
  status: string;
  error_code: string | null;
  error_message: string | null;
  metadata: Record<string, unknown> & {
    pages?: number;
    anthropicFileId?: string;
    ingestion?: IngestionMarker;
  };
  deleted_at: Date | null;
  chunk_count: number;
}

interface IngestionMarker {
  startedAt?: string;
  attempts?: number;
  contentHash?: string;
  completedAt?: string;
  failedAt?: string;
  chunkCount?: number;
  embeddingModel?: string;
  embeddingDim?: number;
  contentOrigin?: 'source' | 'model';
  visionModel?: string;
  visionProvider?: string;
  visionTask?: 'light';
  readyEventClaimedAt?: string;
  readyEventEmittedAt?: string;
  failedEventClaimedAt?: string;
  failedEventEmittedAt?: string;
}

interface LoadedResource {
  id: string;
  ownerId: string;
  formationId: string;
  chapterId: string | null;
  kind: string;
  title: string;
  contentText: string | null;
  storagePath: string | null;
  url: string | null;
  mime: string | null;
  sizeBytes: number | null;
  status: string;
  errorCode: string | null;
  metadata: ResourceRow['metadata'];
  deleted: boolean;
  chunkCount: number;
}

const RESOURCE_COLUMNS = sql`
  r.id::text as id, r.owner_id::text as owner_id, r.formation_id::text as formation_id,
  r.chapter_id::text as chapter_id, r.kind::text as kind, r.title, r.content_text,
  r.storage_path, r.url, r.mime, r.size_bytes::float8 as size_bytes, r.status::text as status,
  r.error_code, r.error_message, r.metadata, r.deleted_at,
  (select count(*)::int from public.resource_chunks c where c.resource_id = r.id) as chunk_count
`;

function toLoaded(row: ResourceRow): LoadedResource {
  return {
    id: row.id,
    ownerId: row.owner_id,
    formationId: row.formation_id,
    chapterId: row.chapter_id,
    kind: row.kind,
    title: row.title,
    contentText: row.content_text,
    storagePath: row.storage_path,
    url: row.url,
    mime: row.mime,
    sizeBytes: row.size_bytes,
    status: row.status,
    errorCode: row.error_code,
    metadata: row.metadata,
    deleted: row.deleted_at !== null,
    chunkCount: row.chunk_count,
  };
}

async function selectResource(
  db: Pick<Db, 'execute'>,
  resourceId: string,
  forUpdate = false,
): Promise<LoadedResource | null> {
  const rows = await db.execute<ResourceRow>(sql`
    select ${RESOURCE_COLUMNS}
    from public.resources r
    where r.id = ${resourceId}::uuid
    ${forUpdate ? sql`for update of r` : sql``}
  `);
  const row = rows[0];
  return row === undefined ? null : toLoaded(row);
}

function skipped(resourceId: string): IngestionOutcome {
  return {
    resourceId,
    outcome: 'skipped',
    chunkCount: 0,
    embeddingCount: 0,
    errorCode: null,
    errorMessage: null,
  };
}

function failed(resourceId: string, error: IngestionError): IngestionOutcome {
  return {
    resourceId,
    outcome: 'failed',
    chunkCount: 0,
    embeddingCount: 0,
    errorCode: error.code as IngestionErrorCode,
    errorMessage: error.detail,
  };
}

function markerPatch(patch: IngestionMarker): string {
  return JSON.stringify(patch);
}

function contentHashOf(content: ExtractedContent, kind: string): string {
  return createHash('sha256').update(kind).update('\0').update(content.text).digest('hex');
}

function safeMessage(error: IngestionError): string {
  return error.detail.replace(/\s+/g, ' ').trim().slice(0, 1000);
}

async function markProcessing(
  ctx: IngestionContext,
  resourceId: string,
): Promise<LoadedResource | null> {
  const now = ctx.clock.now().toISOString();
  const patch = markerPatch({ startedAt: now });
  const rows = await ctx.sdb.execute<ResourceRow>(sql`
    update public.resources r
    set status = 'processing',
        error_code = null,
        error_message = null,
        metadata = jsonb_set(
          r.metadata,
          '{ingestion}',
          (
            coalesce(r.metadata -> 'ingestion', '{}'::jsonb)
              || ${patch}::jsonb
              || jsonb_build_object(
                'attempts',
                coalesce((r.metadata -> 'ingestion' ->> 'attempts')::int, 0) + 1
              )
          ) - 'failedAt' - 'failedEventClaimedAt' - 'failedEventEmittedAt'
            - 'readyEventClaimedAt' - 'readyEventEmittedAt' - 'completedAt'
        )
    where r.id = ${resourceId}::uuid
      and r.deleted_at is null
      and r.status <> 'ready'
    returning ${RESOURCE_COLUMNS}
  `);
  const row = rows[0];
  return row === undefined ? null : toLoaded(row);
}

async function extractResource(
  ctx: IngestionContext,
  deps: IngestionDeps,
  resource: LoadedResource,
): Promise<{ content: ExtractedContent; anthropicFileId: string | null }> {
  if (resource.kind === 'note') {
    return { content: extractNote(resource.contentText), anthropicFileId: null };
  }
  if (resource.kind === 'web') {
    if (resource.url === null) {
      throw new IngestionError('RESOURCE_URL_MISSING', 'L’adresse de cette page est introuvable.');
    }
    const fetched = await extractWebDocument(resource.url, {
      ...(deps.fetchWeb === undefined ? {} : { fetcher: deps.fetchWeb }),
    });
    return { content: fetched.content, anthropicFileId: null };
  }
  if (resource.kind === 'youtube') {
    if (resource.url === null) {
      throw new IngestionError(
        'RESOURCE_URL_MISSING',
        'L’adresse de cette vidéo YouTube est introuvable.',
      );
    }
    const extraction = await extractYoutube(resource.url, {
      ...(deps.youtube === undefined ? {} : { provider: deps.youtube }),
      ...(deps.mode === undefined ? {} : { mode: deps.mode }),
    });
    return { content: youtubeContent(extraction), anthropicFileId: null };
  }
  if (resource.kind === 'image') {
    if (resource.storagePath === null) throw sourceMissing();
    if (resource.sizeBytes !== null && resource.sizeBytes > IMAGE_LIMITS.maxBytes) {
      throw new IngestionError(
        'IMAGE_TOO_LARGE',
        `Cette image dépasse la limite de ${String(Math.floor(IMAGE_LIMITS.maxBytes / 1_048_576))} Mo.`,
      );
    }
    const read = deps.readFile ?? deps.readPdf;
    let bytes: Uint8Array | null;
    try {
      bytes = await read({
        ownerId: resource.ownerId,
        resourceId: resource.id,
        storagePath: resource.storagePath,
        maxBytes: IMAGE_LIMITS.maxBytes,
      });
    } catch (error) {
      if (isIngestionError(error) && error.code === 'PDF_TOO_LARGE') {
        throw new IngestionError(
          'IMAGE_TOO_LARGE',
          `Cette image dépasse la limite de ${String(Math.floor(IMAGE_LIMITS.maxBytes / 1_048_576))} Mo.`,
        );
      }
      throw error;
    }
    if (bytes === null || bytes.length === 0) throw sourceMissing();
    const reader =
      deps.vision ??
      createLlmVisionReader({
        db: ctx.sdb,
        userId: resource.ownerId,
        ...(deps.mode === undefined ? {} : { mode: deps.mode }),
      });
    const image = await extractImageDocument(
      { bytes, mime: resource.mime ?? '', title: resource.title },
      {
        reader,
        db: ctx.sdb,
        userId: resource.ownerId,
        ...(deps.mode === undefined ? {} : { mode: deps.mode }),
      },
    );
    return { content: image.content, anthropicFileId: null };
  }
  if (resource.kind !== 'pdf') {
    throw new IngestionError(
      'RESOURCE_UNSUPPORTED',
      `Le traitement des apports de type « ${resource.kind} » n’est pas disponible.`,
    );
  }
  if (resource.storagePath === null) throw sourceMissing();
  if (resource.sizeBytes !== null && resource.sizeBytes > deps.limits.maxBytes) {
    throw new IngestionError(
      'PDF_TOO_LARGE',
      `Ce PDF dépasse la limite de ${String(Math.floor(deps.limits.maxBytes / 1_048_576))} Mo.`,
    );
  }
  const bytes = await deps.readPdf({
    ownerId: resource.ownerId,
    resourceId: resource.id,
    storagePath: resource.storagePath,
    maxBytes: deps.limits.maxBytes,
  });
  if (bytes === null || bytes.length === 0) throw sourceMissing();
  const content = await extractPdf(bytes, deps.limits);
  const anthropicFileId = await deps.uploadPdf({
    db: ctx.sdb,
    userId: resource.ownerId,
    resourceId: resource.id,
    bytes,
  });
  return { content, anthropicFileId };
}

interface Finalized {
  outcome: 'ready' | 'skipped';
  chunkCount: number;
  embeddingCount: number;
}

async function finalizeReady(
  ctx: IngestionContext,
  deps: IngestionDeps,
  resource: LoadedResource,
  content: ExtractedContent,
  chunks: ReturnType<typeof chunkText>,
  embeddings: number[][],
  anthropicFileId: string | null,
): Promise<Finalized> {
  const contentHash = contentHashOf(content, resource.kind);
  return ctx.sdb.transaction(async (tx) => {
    const locked = await selectResource(tx, resource.id, true);
    if (locked === null || locked.deleted) {
      return { outcome: 'skipped', chunkCount: 0, embeddingCount: 0 };
    }
    if (
      locked.status === 'ready' &&
      locked.metadata.ingestion?.contentHash === contentHash &&
      locked.chunkCount === chunks.length
    ) {
      return {
        outcome: 'ready',
        chunkCount: locked.chunkCount,
        embeddingCount: embeddings.length,
      };
    }

    const now = ctx.clock.now();
    await tx.execute(
      sql`delete from public.resource_chunks where resource_id = ${resource.id}::uuid`,
    );
    for (let offset = 0; offset < chunks.length; offset += CHUNK_INSERT_BATCH) {
      const batch = chunks.slice(offset, offset + CHUNK_INSERT_BATCH);
      const values = batch.map((chunk, index) => {
        const embedding = embeddings[offset + index];
        if (embedding === undefined) {
          throw new IngestionError(
            'EMBEDDING_INVALID',
            'Un passage n’a pas reçu de vecteur : le traitement a été interrompu.',
          );
        }
        return sql`(
          ${resource.id}::uuid, ${resource.ownerId}::uuid, ${resource.formationId}::uuid,
          ${resource.chapterId}::uuid, ${chunk.position}, ${chunk.text},
          ${JSON.stringify(chunk.location)}::jsonb, ${chunk.tokenCount},
          ${toVectorLiteral(embedding)}::extensions.vector, ${now.toISOString()}::timestamptz
        )`;
      });
      await tx.execute(sql`
        insert into public.resource_chunks (
          resource_id, owner_id, formation_id, chapter_id, position, text, location,
          token_count, embedding, created_at
        )
        values ${sql.join(values, sql`, `)}
      `);
    }

    const ingestion: IngestionMarker = {
      ...(locked.metadata.ingestion ?? {}),
      contentHash,
      completedAt: now.toISOString(),
      chunkCount: chunks.length,
      embeddingModel: EMBEDDING_MODEL,
      embeddingDim: embeddings[0]?.length ?? 0,
      contentOrigin: content.contentOrigin ?? 'source',
    };
    delete ingestion.failedAt;
    delete ingestion.failedEventClaimedAt;
    delete ingestion.failedEventEmittedAt;
    if (content.vision === undefined) {
      delete ingestion.visionModel;
      delete ingestion.visionProvider;
      delete ingestion.visionTask;
    } else {
      ingestion.visionModel = content.vision.modelId;
      ingestion.visionProvider = content.vision.provider;
      ingestion.visionTask = content.vision.task;
    }
    const nextTitle = content.title?.trim();
    const title =
      nextTitle === undefined || nextTitle === '' ? locked.title : nextTitle.slice(0, 200);
    const metadata: Record<string, unknown> = {
      ...locked.metadata,
      ...(content.metadata ?? {}),
      ...(content.pages === null ? {} : { pages: content.pages }),
      ...(anthropicFileId === null ? {} : { anthropicFileId }),
      ingestion,
    };
    await tx.execute(sql`
      update public.resources
      set status = 'ready',
          title = ${title},
          error_code = null,
          error_message = null,
          metadata = ${JSON.stringify(metadata)}::jsonb
      where id = ${resource.id}::uuid and deleted_at is null
    `);
    return {
      outcome: 'ready',
      chunkCount: chunks.length,
      embeddingCount: embeddings.length,
    };
  });
}

interface EventClaim {
  claimed: boolean;
  emitted: boolean;
}

async function claimEvent(
  ctx: IngestionContext,
  resourceId: string,
  kind: 'ready' | 'failed',
): Promise<EventClaim> {
  const now = ctx.clock.now();
  const staleBefore = new Date(now.getTime() - INGESTION_EVENT_CLAIM_STALE_MS).toISOString();
  const claimedField = kind === 'ready' ? 'readyEventClaimedAt' : 'failedEventClaimedAt';
  const emittedField = kind === 'ready' ? 'readyEventEmittedAt' : 'failedEventEmittedAt';
  const emitted = await ctx.sdb.execute<{ emitted: boolean }>(sql`
    select coalesce(metadata -> 'ingestion' ->> ${emittedField}, null) is not null as emitted
    from public.resources
    where id = ${resourceId}::uuid
  `);
  if (emitted[0]?.emitted === true) return { claimed: false, emitted: true };
  const rows = await ctx.sdb.execute<{ id: string }>(sql`
    update public.resources
    set metadata = jsonb_set(
      metadata,
      ${`{ingestion,${claimedField}}`}::text[],
      to_jsonb(${now.toISOString()}::text)
    )
    where id = ${resourceId}::uuid
      and deleted_at is null
      and metadata -> 'ingestion' ->> ${emittedField} is null
      and (
        metadata -> 'ingestion' ->> ${claimedField} is null
        or (metadata -> 'ingestion' ->> ${claimedField})::timestamptz < ${staleBefore}::timestamptz
      )
    returning id::text as id
  `);
  return { claimed: rows.length > 0, emitted: false };
}

async function markEventEmitted(
  ctx: IngestionContext,
  resourceId: string,
  kind: 'ready' | 'failed',
): Promise<void> {
  const now = ctx.clock.now().toISOString();
  const emittedField = kind === 'ready' ? 'readyEventEmittedAt' : 'failedEventEmittedAt';
  await ctx.sdb.execute(sql`
    update public.resources
    set metadata = jsonb_set(
      metadata,
      ${`{ingestion,${emittedField}}`}::text[],
      to_jsonb(${now}::text)
    )
    where id = ${resourceId}::uuid
  `);
}

async function clearEventClaim(
  ctx: IngestionContext,
  resourceId: string,
  kind: 'ready' | 'failed',
): Promise<void> {
  const claimedField = kind === 'ready' ? 'readyEventClaimedAt' : 'failedEventClaimedAt';
  await ctx.sdb.execute(sql`
    update public.resources
    set metadata = metadata #- ${`{ingestion,${claimedField}}`}::text[]
    where id = ${resourceId}::uuid
  `);
}

async function publishEvent(
  ctx: IngestionContext,
  events: IngestionEvents,
  resource: LoadedResource,
  kind: 'ready' | 'failed',
): Promise<void> {
  const claim = await claimEvent(ctx, resource.id, kind);
  if (!claim.claimed) return;
  try {
    if (kind === 'ready') {
      await events.resourceReady({
        userId: resource.ownerId,
        resourceId: resource.id,
        chunkCount: resource.chunkCount,
      });
    } else {
      const errorCode = resource.errorCode ?? 'EXTRACTION_FAILED';
      await events.resourceFailed({
        userId: resource.ownerId,
        resourceId: resource.id,
        errorCode,
      });
    }
  } catch (error) {
    await clearEventClaim(ctx, resource.id, kind);
    throw error;
  }
  await markEventEmitted(ctx, resource.id, kind);
}

async function publishReady(
  ctx: IngestionContext,
  deps: IngestionDeps,
  resource: LoadedResource,
): Promise<void> {
  const fresh = await selectResource(ctx.sdb, resource.id);
  if (fresh === null || fresh.deleted || fresh.status !== 'ready') return;
  await publishEvent(ctx, deps.events, fresh, 'ready');
}

async function markFailed(
  ctx: IngestionContext,
  resource: LoadedResource,
  error: IngestionError,
): Promise<boolean> {
  const now = ctx.clock.now().toISOString();
  const message = safeMessage(error);
  const patch = markerPatch({ failedAt: now });
  const rows = await ctx.sdb.execute<{ id: string }>(sql`
    update public.resources
    set status = 'failed',
        error_code = ${error.code},
        error_message = ${message},
        metadata = jsonb_set(
          metadata,
          '{ingestion}',
          coalesce(metadata -> 'ingestion', '{}'::jsonb) || ${patch}::jsonb
        )
    where id = ${resource.id}::uuid
      and deleted_at is null
      and status <> 'ready'
    returning id::text as id
  `);
  return rows.length > 0;
}

async function publishFailed(
  ctx: IngestionContext,
  deps: IngestionDeps,
  resourceId: string,
): Promise<void> {
  const fresh = await selectResource(ctx.sdb, resourceId);
  if (fresh === null || fresh.deleted || fresh.status !== 'failed') return;
  await publishEvent(ctx, deps.events, fresh, 'failed');
}

/**
 * ET-1 — processes one owned note or PDF. The caller passes the Inngest steps when running as a
 * job; a direct call runs the same stages in order. The result is validated by the contract.
 */
async function processValidated(
  ctx: IngestionContext,
  resourceId: string,
  deps: IngestionDeps,
): Promise<IngestionOutcome> {
  const run: StepRunner['run'] = ctx.step?.run.bind(ctx.step) ?? ((_name, fn) => fn());
  const loaded = await run('load-resource', () => selectResource(ctx.sdb, resourceId));
  if (loaded === null || loaded.deleted) return skipped(resourceId);
  if (
    loaded.kind !== 'note' &&
    loaded.kind !== 'pdf' &&
    loaded.kind !== 'web' &&
    loaded.kind !== 'youtube' &&
    loaded.kind !== 'image'
  ) {
    ctx.logger.info('resource kind left for its own ingestion', {
      component: 'ingestion',
      operation: loaded.kind,
      outcome: 'skipped',
    });
    return skipped(resourceId);
  }

  if (
    loaded.status === 'ready' &&
    loaded.chunkCount > 0 &&
    loaded.metadata.ingestion?.completedAt !== undefined
  ) {
    await run('publish-ready', () => publishReady(ctx, deps, loaded));
    return {
      resourceId,
      outcome: 'ready',
      chunkCount: loaded.chunkCount,
      embeddingCount: loaded.chunkCount,
      errorCode: null,
      errorMessage: null,
    };
  }

  const processing = await run('mark-processing', () => markProcessing(ctx, resourceId));
  if (processing === null) return skipped(resourceId);

  try {
    const extracted = await run('extract', () => extractResource(ctx, deps, processing));
    const chunks = await run('chunk', () =>
      Promise.resolve(
        chunkText({
          text: extracted.content.text,
          locations: extracted.content.locations,
        }),
      ),
    );
    const embeddings = await run('embed', () =>
      embedTexts(
        deps.embedder,
        chunks.map((chunk) => chunk.text),
      ),
    );
    const finalized = await run('finalize', () =>
      finalizeReady(
        ctx,
        deps,
        processing,
        extracted.content,
        chunks,
        embeddings,
        extracted.anthropicFileId,
      ),
    );
    if (finalized.outcome === 'skipped') return skipped(resourceId);
    await run('publish-ready', () => publishReady(ctx, deps, processing));
    ctx.logger.info('resource ready', {
      component: 'ingestion',
      operation: processing.kind,
      outcome: 'ready',
      code: String(finalized.chunkCount),
    });
    return {
      resourceId,
      outcome: 'ready',
      chunkCount: finalized.chunkCount,
      embeddingCount: finalized.embeddingCount,
      errorCode: null,
      errorMessage: null,
    };
  } catch (error) {
    if (isIngestionError(error) && error.permanent) {
      const marked = await run('mark-failed', () => markFailed(ctx, processing, error));
      if (marked) {
        await run('publish-failed', () => publishFailed(ctx, deps, resourceId));
      }
      ctx.logger.warn('resource failed', {
        component: 'ingestion',
        operation: processing.kind,
        outcome: 'failed',
        code: error.code,
      });
      return failed(resourceId, error);
    }
    // Transient (Voyage, Storage): keep `processing` and let the job retry (CL-3).
    if (error instanceof AppError) {
      ctx.logger.warn('resource processing deferred', {
        component: 'ingestion',
        operation: processing.kind,
        outcome: 'retry',
        code: error.code,
      });
    }
    throw error;
  }
}

/**
 * ET-1, ET-4 — public entry point. The identifier is validated by Zod before any query and the
 * returned outcome is validated again, so a caller never stores an unexpected shape.
 */
export async function processResource(
  ctx: IngestionContext,
  resourceId: string,
  deps: IngestionDeps = defaultIngestionDeps({ logger: ctx.logger }),
): Promise<IngestionOutcome> {
  const input = ProcessResourceInput.safeParse({ resourceId });
  if (!input.success) {
    throw new AppError('VALIDATION_FAILED', 'Identifiant d’apport invalide.', {
      errors: [{ path: 'resourceId', message: 'Identifiant UUID attendu.' }],
    });
  }
  const outcome = await processValidated(ctx, input.data.resourceId, deps);
  return IngestionOutcome.parse(outcome);
}
