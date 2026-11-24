// Deterministic test embeddings (SPEC-104 §8.4, ADR-0056 `mock` mode).
//
// The real provider (Voyage `voyage-4-lite`) is never called in tests or in the demonstration: each
// component is derived from SHA-256 blocks of the text, mapped to [-1, 1] and normalised to the unit
// L2 norm. The same rule is reused by the ingestion (SPEC-509) and the search (SPEC-511) in mock
// mode, so a query and the passage that contains it are close in the cosine metric.
import { createHash } from 'node:crypto';

import { EMBEDDING_DIM } from '@learny/config';

/**
 * Builds a deterministic 1024-dimension embedding for `text`: same text → same vector, different
 * texts → different vectors, and every vector has an L2 norm of 1 (ADR-0056).
 */
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
    // Impossible in practice (128 SHA-256 blocks), but a unit vector keeps the contract.
    const fallback = Array<number>(EMBEDDING_DIM).fill(0);
    fallback[0] = 1;
    return fallback;
  }
  return components.map((value) => value / norm);
}

/** pgvector text input of an embedding (`'[0.1,0.2,…]'`), accepted by a `vector` cast. */
export function toVectorLiteral(embedding: readonly number[]): string {
  return `[${embedding.map((value) => String(value)).join(',')}]`;
}
