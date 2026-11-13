// Embeddings of the passages (SPEC-509 EF-4, ET-2; ADR-0056).
//
// Live mode calls Voyage AI `voyage-4-lite` with the server-side key; mock mode derives a
// deterministic unit vector from SHA-256 blocks of the text, exactly like `fakeEmbedding` of
// `@learny/db/testing`, so no test or demonstration ever reaches the network. Every vector is
// checked to have exactly `EMBEDDING_DIM` finite components before anything is written.
import { createHash } from 'node:crypto';

import { z } from 'zod';

import { EMBEDDING_DIM, type LlmMode } from '@learny/config';

import { IngestionError } from './errors';

export const EMBEDDING_MODEL = 'voyage-4-lite';
export const EMBEDDING_BATCH_SIZE = 64;

export interface EmbeddingClient {
  embed(texts: readonly string[]): Promise<number[][]>;
}

/** ADR-0056 — deterministic 1024-dimension unit vector used in `LLM_MODE=mock`. */
export function fakeEmbedding(text: string): number[] {
  const components: number[] = [];
  for (let block = 0; components.length < EMBEDDING_DIM; block += 1) {
    const digest = createHash('sha256')
      .update(`${String(block)}:${text}`)
      .digest();
    for (
      let offset = 0;
      offset + 4 <= digest.length && components.length < EMBEDDING_DIM;
      offset += 4
    ) {
      components.push((digest.readUInt32BE(offset) / 0xffff_ffff) * 2 - 1);
    }
  }
  const norm = Math.sqrt(components.reduce((sum, value) => sum + value * value, 0));
  if (norm === 0) {
    const fallback = Array<number>(EMBEDDING_DIM).fill(0);
    fallback[0] = 1;
    return fallback;
  }
  return components.map((value) => value / norm);
}

/** pgvector text input (`'[0.1,0.2,…]'`). */
export function toVectorLiteral(embedding: readonly number[]): string {
  return `[${embedding.map((value) => String(value)).join(',')}]`;
}

export function mockEmbeddingClient(): EmbeddingClient {
  return {
    embed: (texts) => Promise.resolve(texts.map((text) => fakeEmbedding(text))),
  };
}

const VoyageResponse = z.object({
  data: z.array(z.object({ embedding: z.array(z.number()) })),
});

export interface VoyageOptions {
  apiKey: string | null;
  fetchImplementation?: typeof fetch;
  endpoint?: string;
}

/**
 * EF-4 — Voyage AI client. A missing key is a permanent configuration failure; 429 and 5xx are
 * transient and leave the resource `processing` for the next attempt (CL-3). The provider body is
 * never surfaced: it can quote the input.
 */
export function voyageEmbeddingClient(options: VoyageOptions): EmbeddingClient {
  const endpoint = options.endpoint ?? 'https://api.voyageai.com/v1/embeddings';
  const fetchImplementation = options.fetchImplementation ?? fetch;
  return {
    async embed(texts) {
      if (options.apiKey === null || options.apiKey.trim() === '') {
        throw new IngestionError(
          'EMBEDDING_KEY_INVALID',
          'Le service d’embeddings n’est pas configuré : ajoutez la clé Voyage côté serveur.',
        );
      }
      let response: Response;
      try {
        response = await fetchImplementation(endpoint, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${options.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            input: texts,
            model: EMBEDDING_MODEL,
            input_type: 'document',
            output_dimension: EMBEDDING_DIM,
          }),
        });
      } catch (error) {
        throw new IngestionError(
          'EMBEDDING_UNAVAILABLE',
          'Le service d’embeddings est momentanément indisponible : une nouvelle tentative est possible.',
          { permanent: false, cause: error },
        );
      }
      if (response.status === 401 || response.status === 403) {
        throw new IngestionError(
          'EMBEDDING_KEY_INVALID',
          'La clé du service d’embeddings est refusée : vérifiez sa configuration.',
          { status: response.status },
        );
      }
      if (response.status === 429 || response.status >= 500) {
        throw new IngestionError(
          'EMBEDDING_UNAVAILABLE',
          'Le service d’embeddings est momentanément indisponible : une nouvelle tentative est possible.',
          { permanent: false, status: response.status },
        );
      }
      if (!response.ok) {
        throw new IngestionError(
          'EMBEDDING_INVALID',
          'Le service d’embeddings a refusé la requête : le texte de l’apport est peut-être invalide.',
          { status: response.status },
        );
      }
      let payload: unknown;
      try {
        payload = await response.json();
      } catch (error) {
        throw new IngestionError(
          'EMBEDDING_INVALID',
          'Le service d’embeddings a renvoyé une réponse illisible.',
          { cause: error },
        );
      }
      const parsed = VoyageResponse.safeParse(payload);
      if (!parsed.success) {
        throw new IngestionError(
          'EMBEDDING_INVALID',
          'Le service d’embeddings a renvoyé une réponse invalide.',
        );
      }
      return parsed.data.data.map((entry) => entry.embedding);
    },
  };
}

/** Resolves the embedding provider from `LLM_MODE`; mock is the default outside live. */
export function defaultEmbeddingClient(
  env: Readonly<Record<string, string | undefined>> = process.env,
): EmbeddingClient {
  const mode: LlmMode = env.LLM_MODE === 'live' ? 'live' : 'mock';
  if (mode === 'mock') return mockEmbeddingClient();
  return voyageEmbeddingClient({ apiKey: env.VOYAGE_API_KEY ?? null });
}

function invalidVector(index: number): IngestionError {
  return new IngestionError(
    'EMBEDDING_INVALID',
    `Le vecteur du passage ${String(index + 1)} n’a pas ${String(EMBEDDING_DIM)} dimensions valides.`,
  );
}

/**
 * EF-4 — embeds passages in order, 64 at a time. The result has exactly one 1024-component vector
 * per input; anything else is refused before a single row is written.
 */
export async function embedTexts(
  client: EmbeddingClient,
  texts: readonly string[],
  batchSize = EMBEDDING_BATCH_SIZE,
): Promise<number[][]> {
  if (texts.length === 0) {
    throw new IngestionError('TEXT_EMPTY', 'Aucun passage à vectoriser.');
  }
  const vectors: number[][] = [];
  for (let offset = 0; offset < texts.length; offset += batchSize) {
    const batch = texts.slice(offset, offset + batchSize);
    const embedded = await client.embed(batch);
    if (embedded.length !== batch.length) {
      throw new IngestionError(
        'EMBEDDING_INVALID',
        'Le service d’embeddings n’a pas renvoyé un vecteur par passage.',
      );
    }
    for (const vector of embedded) {
      const index = vectors.length;
      if (
        vector.length !== EMBEDDING_DIM ||
        vector.some((component) => !Number.isFinite(component))
      ) {
        throw invalidVector(index);
      }
      vectors.push(vector);
    }
  }
  return vectors;
}
