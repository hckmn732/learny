import { z } from 'zod';

import { Uuid } from './common';
import { IngestionChunkLocation } from './ingestion';

// Contracts of the semantic retrieval and context selection (SPEC-511 EF-1 to EF-5, ET-1 to
// ET-4; ADR-0056, docs/architecture/ai.md §3).
//
// The service returns located passages of the caller's own resources only. `selectContext` then
// orders, deduplicates and cuts them to the token budget of the task, and `formatDocumentChunk`
// wraps every selected passage in a `<document>` data tag. Nothing here reaches a model directly:
// callers concatenate the formatted documents and keep them inside data tags (BR-IA-10).

/** ADR-0056 — every embedding handled by the retrieval has exactly this many dimensions. */
export const RETRIEVAL_EMBEDDING_DIM = 1024;

/**
 * docs/architecture/ai.md §3 — context budgets of `read_resources`, in tokens. The values include
 * the `<document>` tags and their attributes: the selection never exceeds them.
 */
export const RETRIEVAL_TOKEN_BUDGETS = {
  programme: 6_000,
  course: 24_000,
  gaps: 8_000,
  tutor: 4_000,
} as const;

export const RETRIEVAL_TASKS = ['programme', 'course', 'gaps', 'tutor'] as const;
export const RetrievalTask = z.enum(RETRIEVAL_TASKS);
export type RetrievalTask = z.infer<typeof RetrievalTask>;

/** EF-1 — bounds of one nearest-neighbour query. */
export const RETRIEVAL_DEFAULT_LIMIT = 10;
export const RETRIEVAL_MAX_LIMIT = 50;
/** A single context can never be asked for more than this: the product budgets are far below. */
export const RETRIEVAL_MAX_TOKEN_BUDGET = 200_000;
/** EF-2, ADR-0300 — passages whose normalised 5-gram overlap reaches this ratio are duplicates. */
export const RETRIEVAL_OVERLAP_THRESHOLD = 0.8;

/** EF-5 — an empty result is explained, never silently invented or padded. */
export const RETRIEVAL_EMPTY_REASONS = ['no_matches', 'budget_exhausted'] as const;
export const RetrievalEmptyReason = z.enum(RETRIEVAL_EMPTY_REASONS);
export type RetrievalEmptyReason = z.infer<typeof RetrievalEmptyReason>;

export const RETRIEVAL_NO_MATCHES_MESSAGE =
  'Aucun passage de vos apports ne correspond à cette recherche.';
export const RETRIEVAL_UNAVAILABLE_MESSAGE =
  'La recherche de passages est momentanément indisponible. Vous pouvez continuer sans source.';
export const RETRIEVAL_INVALID_DIMENSION_MESSAGE = `Le vecteur de requête doit contenir ${String(
  RETRIEVAL_EMBEDDING_DIM,
)} dimensions.`;
export const RETRIEVAL_INVALID_BUDGET_MESSAGE =
  'Le budget de contexte doit être un nombre entier de jetons strictement positif.';
export const RETRIEVAL_INVALID_TASK_MESSAGE =
  'La tâche demandée ne dispose pas de budget de contexte.';

/** ET-1 — input of `searchRelevantChunks`, validated before any SQL (CL-2). */
export const SearchRelevantChunksInput = z
  .strictObject({
    formationId: Uuid,
    chapterId: Uuid.optional(),
    queryEmbedding: z
      .array(z.number())
      .length(RETRIEVAL_EMBEDDING_DIM, { message: RETRIEVAL_INVALID_DIMENSION_MESSAGE })
      .describe('Vecteur de requête normalisé, 1024 dimensions (ADR-0056).'),
    limit: z.int().min(1).max(RETRIEVAL_MAX_LIMIT).default(RETRIEVAL_DEFAULT_LIMIT),
  })
  .describe('Recherche des passages les plus proches dans une formation ou un chapitre.');
/** Input shape: `limit` may be omitted and defaults to `RETRIEVAL_DEFAULT_LIMIT`. */
export type SearchRelevantChunksInput = z.input<typeof SearchRelevantChunksInput>;

/** BR-APP-06 — citation coordinates shown in the tag and in the interface. */
export const RetrievalLocation = IngestionChunkLocation;
export type RetrievalLocation = z.infer<typeof RetrievalLocation>;

/** ET-1, EF-4 — one located passage returned by the search. */
export const RetrievalChunk = z
  .strictObject({
    chunkId: Uuid,
    resourceId: Uuid,
    /** Resource title, escaped by `formatDocumentChunk` before entering the model context. */
    source: z.string().min(1).max(200),
    position: z.int().min(0),
    /** Cosine similarity in [-1, 1]; the order is descending. */
    score: z.number().min(-1).max(1),
    text: z.string().min(1).max(20_000),
    location: RetrievalLocation,
    /** Token estimate of the raw text, kept for display; the budget uses the formatted tag. */
    tokenCount: z.int().min(0),
  })
  .describe('Passage localisé, avec son score cosinus et sa source.');
export type RetrievalChunk = z.infer<typeof RetrievalChunk>;

/** ET-1, EF-5 — a search either returns scored passages or a single honest empty reason. */
export const RetrievalSearchResult = z
  .strictObject({
    reason: z.literal('no_matches').nullable(),
    chunks: z.array(RetrievalChunk),
  })
  .superRefine((value, ctx) => {
    if (value.chunks.length === 0 && value.reason !== 'no_matches') {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Une recherche vide porte la raison no_matches.',
      });
    }
    if (value.chunks.length > 0 && value.reason !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Une recherche non vide ne porte pas de raison vide.',
      });
    }
  })
  .describe('Résultat validé de la recherche sémantique.');
export type RetrievalSearchResult = z.infer<typeof RetrievalSearchResult>;

/**
 * ET-2, EF-4 — minimum shape required by `formatDocumentChunk`. Extra fields of `RetrievalChunk`
 * are accepted so that a searched passage can be formatted directly.
 */
export const DocumentChunk = z
  .object({
    source: z.string().min(1).max(200),
    chunkId: Uuid,
    text: z.string().min(1).max(20_000),
    location: RetrievalLocation,
  })
  .describe('Passage formatable sous balise de données.');
export type DocumentChunk = z.infer<typeof DocumentChunk>;

/** ET-2 — one context selection, with its exact token accounting. */
export const ContextSelection = z
  .strictObject({
    task: RetrievalTask,
    tokenBudget: z.int().min(1).max(RETRIEVAL_MAX_TOKEN_BUDGET),
    /** Tokens reserved for the selected documents, tags and separators included. */
    estimatedTokens: z.int().min(0),
    reason: RetrievalEmptyReason.nullable(),
    chunks: z.array(RetrievalChunk),
    documents: z.array(z.string()),
    text: z.string(),
    /** Passages removed because they duplicated or overlapped a better one. */
    duplicates: z.int().min(0),
    /** Passages removed because their formatted tag did not fit the remaining budget. */
    omitted: z.int().min(0),
  })
  .superRefine((value, ctx) => {
    if (value.estimatedTokens > value.tokenBudget) {
      ctx.addIssue({
        code: 'custom',
        path: ['estimatedTokens'],
        message: 'Le contexte sélectionné dépasse le budget de la tâche.',
      });
    }
    if (value.chunks.length === 0 && value.reason === null) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Un contexte vide porte une raison.',
      });
    }
    if (value.chunks.length > 0 && value.reason !== null) {
      ctx.addIssue({
        code: 'custom',
        path: ['reason'],
        message: 'Un contexte non vide ne porte pas de raison vide.',
      });
    }
    if (value.documents.length !== value.chunks.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['documents'],
        message: 'Chaque passage retenu possède un document formaté.',
      });
    }
  })
  .describe('Contexte sélectionné pour une tâche, dans la limite de son budget de jetons.');
export type ContextSelection = z.infer<typeof ContextSelection>;

/** ET-2 — input of `selectContext`, validated before sorting or formatting. */
export const SelectContextInput = z
  .strictObject({
    chunks: z.array(RetrievalChunk),
    task: RetrievalTask,
    tokenBudget: z.int().min(1).max(RETRIEVAL_MAX_TOKEN_BUDGET).optional(),
  })
  .describe('Passages candidats et budget de la tâche appelante.');
export type SelectContextInput = z.infer<typeof SelectContextInput>;
