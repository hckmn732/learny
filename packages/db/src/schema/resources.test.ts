// Unit tests of the resource schemas, JSON shapes and deterministic embeddings (SPEC-104 §12).
import { describe, expect, it } from 'vitest';

import { EMBEDDING_DIM } from '@learny/config';

import { fakeEmbedding, toVectorLiteral } from '../testing/embedding';

import { resourceChunks } from './resources';
import { chunkLocationSchema, resourceMetadataSchema } from './resources.json-schemas';

describe('[SPEC-104] schémas ressources', () => {
  it('accepte une position complète et refuse une plage de caractères vide', () => {
    expect(
      chunkLocationSchema.safeParse({
        page: 4,
        startSec: 12.5,
        endSec: 42,
        anchor: 'cles-de-comptabilisation',
        charStart: 10,
        charEnd: 48,
      }).success,
    ).toBe(true);
    expect(chunkLocationSchema.safeParse({ charStart: 10, charEnd: 10 }).success).toBe(false);
    expect(chunkLocationSchema.safeParse({ charStart: 10, charEnd: 9 }).success).toBe(false);
    expect(chunkLocationSchema.safeParse({ charStart: -1, charEnd: 9 }).success).toBe(false);
    expect(chunkLocationSchema.safeParse({ page: 0, charStart: 0, charEnd: 5 }).success).toBe(
      false,
    );
  });

  it('exige endSec supérieur ou égal à startSec et borne l’ancre', () => {
    expect(
      chunkLocationSchema.safeParse({ startSec: 10, endSec: 9, charStart: 0, charEnd: 5 }).success,
    ).toBe(false);
    expect(
      chunkLocationSchema.safeParse({ startSec: 10, endSec: 10, charStart: 0, charEnd: 5 }).success,
    ).toBe(true);
    expect(
      chunkLocationSchema.safeParse({ anchor: 'a'.repeat(201), charStart: 0, charEnd: 5 }).success,
    ).toBe(false);
    expect(
      chunkLocationSchema.safeParse({ anchor: 'a'.repeat(200), charStart: 0, charEnd: 5 }).success,
    ).toBe(true);
  });

  it('refuse les clés inconnues de la position et des métadonnées', () => {
    expect(
      chunkLocationSchema.safeParse({ charStart: 0, charEnd: 5, unexpected: true }).success,
    ).toBe(false);
    expect(resourceMetadataSchema.safeParse({ inconnu: 1 }).success).toBe(false);
  });

  it('accepte les métadonnées facultatives de l’ingestion', () => {
    expect(resourceMetadataSchema.safeParse({}).success).toBe(true);
    expect(
      resourceMetadataSchema.safeParse({
        pages: 12,
        durationSec: 321.5,
        language: 'fr',
        youtubeId: 'dQw4w9WgXcQ',
        siteName: 'Légifrance',
        anthropicFileId: 'file_123',
      }).success,
    ).toBe(true);
    expect(resourceMetadataSchema.safeParse({ pages: 0 }).success).toBe(false);
    expect(resourceMetadataSchema.safeParse({ durationSec: -1 }).success).toBe(false);
  });

  it('EMBEDDING_DIM est la dimension de la colonne vectorielle (ET-2, CA-1)', () => {
    expect(EMBEDDING_DIM).toBe(1024);
    expect(resourceChunks.embedding.getSQLType()).toBe(`vector(${String(EMBEDDING_DIM)})`);
  });
});

describe('[SPEC-104] embeddings factices', () => {
  it('produit 1 024 composantes de norme 1', () => {
    const embedding = fakeEmbedding('clé débit');
    expect(embedding).toHaveLength(EMBEDDING_DIM);
    const norm = Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
    expect(Math.abs(norm - 1)).toBeLessThanOrEqual(1e-9);
  });

  it('est déterministe et distingue deux textes', () => {
    expect(fakeEmbedding('clé débit')).toEqual(fakeEmbedding('clé débit'));
    expect(fakeEmbedding('clé débit')).not.toEqual(fakeEmbedding('clé crédit'));
  });

  it('sérialise un vecteur au format pgvector', () => {
    expect(toVectorLiteral([0.5, -1])).toBe('[0.5,-1]');
  });
});
