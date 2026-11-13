// Semantic retrieval of the passages of one learner (SPEC-511 EF-1, EF-5, ET-1, ET-4; ADR-0056).
//
// The query runs on the user-scoped client: Row Level Security is active and the explicit
// `owner_id` filter repeats the rule, so a foreign formation or chapter returns no row (CL-1).
// The vector is a bound parameter cast to `extensions.vector`; the cosine operator uses the HNSW
// index (`vector_cosine_ops`). The order is total — distance, title, position, identifier — so a
// reload or a duplicate delivery returns the same list (idempotent read).
//
// No provider is called here: the caller supplies the query embedding (ADR-0048 mock mode in tests
// and demonstration). Database failures become a safe `SERVICE_UNAVAILABLE`; the query and the
// passage contents are never logged.
import {
  RETRIEVAL_UNAVAILABLE_MESSAGE,
  RetrievalChunk,
  RetrievalSearchResult,
  SearchRelevantChunksInput,
  type RetrievalLocation,
  type RetrievalSearchResult as RetrievalSearchResultValue,
} from '@learny/contracts';
import { AppError, type LearnyLogger } from '@learny/core';
import { sql, type UserDatabase } from '@learny/db';
import { estimateTokens } from '@learny/llm';

/** ADR-0238, SPEC-104 §15 — candidate width of the HNSW index for one search. */
export const RETRIEVAL_HNSW_EF_SEARCH = 40;

export interface RetrievalContext {
  /** Owner of the search; `null` when the request is anonymous. */
  userId: string | null;
  /** Row Level Security client of the user; `null` when the request is anonymous. */
  db: UserDatabase | null;
  logger: LearnyLogger;
}

interface ChunkRow extends Record<string, unknown> {
  chunk_id: string;
  resource_id: string;
  source: string;
  position: number;
  score: number | string;
  text: string;
  location: RetrievalLocation | string;
  token_count: number | null;
}

function invalidInput(error: { issues: { path: PropertyKey[]; message: string }[] }): AppError {
  const first = error.issues[0]?.message;
  return new AppError(
    'VALIDATION_FAILED',
    first === undefined
      ? 'La recherche de passages est invalide.'
      : `La recherche de passages est invalide : ${first}`,
    {
      errors: error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        message: issue.message,
      })),
    },
  );
}

function parseLocation(value: ChunkRow['location']): RetrievalLocation {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value) as RetrievalLocation;
  } catch {
    throw new AppError('INTERNAL_ERROR', 'Un passage indexé porte un emplacement illisible.');
  }
}

function toChunk(row: ChunkRow): RetrievalChunk {
  const parsed = RetrievalChunk.safeParse({
    chunkId: row.chunk_id,
    resourceId: row.resource_id,
    source: row.source,
    position: row.position,
    score: Number(row.score),
    text: row.text,
    location: parseLocation(row.location),
    tokenCount: row.token_count ?? estimateTokens(row.text),
  });
  if (!parsed.success) {
    throw new AppError('INTERNAL_ERROR', 'Un passage indexé ne respecte pas le contrat.');
  }
  return parsed.data;
}

/**
 * EF-1, ET-1 — nearest passages of one formation (and optionally one chapter) by cosine
 * similarity. Returns `{ reason: 'no_matches', chunks: [] }` when nothing is admissible, never an
 * invented passage. The caller decides whether its task can continue without a source.
 */
export async function searchRelevantChunks(
  ctx: RetrievalContext,
  input: SearchRelevantChunksInput,
): Promise<RetrievalSearchResultValue> {
  const parsed = SearchRelevantChunksInput.safeParse(input);
  if (!parsed.success) throw invalidInput(parsed.error);
  if (ctx.userId === null || ctx.db === null) {
    throw new AppError('UNAUTHENTICATED', 'Vous devez être connecté pour rechercher vos passages.');
  }
  const { formationId, chapterId, queryEmbedding, limit } = parsed.data;
  const vector = `[${queryEmbedding.map((value) => String(value)).join(',')}]`;
  const chapterFilter =
    chapterId === undefined ? sql`` : sql`and c.chapter_id = ${chapterId}::uuid`;

  let rows: ChunkRow[];
  try {
    rows = await ctx.db.run(async (tx) => {
      // The setting lives in the transaction; a literal is required by SET LOCAL.
      await tx.execute(sql.raw(`set local hnsw.ef_search = ${String(RETRIEVAL_HNSW_EF_SEARCH)}`));
      return tx.execute<ChunkRow>(sql`
        select
          c.id::text as chunk_id,
          c.resource_id::text as resource_id,
          r.title as source,
          c.position,
          (1 - (c.embedding <=> ${vector}::extensions.vector))::float8 as score,
          c.text,
          c.location,
          c.token_count
        from public.resource_chunks c
        join public.resources r on r.id = c.resource_id
        where c.owner_id = ${ctx.userId}::uuid
          and c.formation_id = ${formationId}::uuid
          ${chapterFilter}
          and c.embedding is not null
          and r.deleted_at is null
          and r.status = 'ready'
        order by
          c.embedding <=> ${vector}::extensions.vector,
          r.title asc,
          c.position asc,
          c.id asc
        limit ${limit}
      `);
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    ctx.logger.warn('retrieval search failed', {
      component: 'retrieval',
      operation: 'search',
      outcome: 'error',
      code: 'SERVICE_UNAVAILABLE',
    });
    throw new AppError('SERVICE_UNAVAILABLE', RETRIEVAL_UNAVAILABLE_MESSAGE);
  }

  const chunks = rows.map(toChunk);
  return RetrievalSearchResult.parse({
    reason: chunks.length === 0 ? 'no_matches' : null,
    chunks,
  });
}
