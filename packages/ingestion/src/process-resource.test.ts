// Unit tests of the pure ingestion stages (SPEC-509 §12, CA-1 to CA-3).
import { describe, expect, it, vi } from 'vitest';

import { EMBEDDING_DIM } from '@learny/config';
import { AppError } from '@learny/core';
import { fakeEmbedding as databaseFakeEmbedding } from '@learny/db/testing';

import { buildEmptyPdf, buildTextPdf, corruptedPdf, DEMO_NOTE, demoPdf } from '../fixtures/pdf';

import { chunkText } from './chunk';
import {
  defaultEmbeddingClient,
  embedTexts,
  fakeEmbedding,
  mockEmbeddingClient,
  toVectorLiteral,
  voyageEmbeddingClient,
  type EmbeddingClient,
} from './embeddings';
import { IngestionError } from './errors';
import { extractNote } from './extract/note';
import { DEFAULT_PDF_LIMITS, extractPdf } from './extract/pdf';

const UUID = '00000000-0000-4000-8000-000000000509';

async function codeOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (error) {
    if (error instanceof AppError) return error.code;
    throw error;
  }
  throw new Error('Aucune erreur levée.');
}

describe('[SPEC-509] Ingestion : notes et PDF, découpage, embeddings', () => {
  it('découpe une note courte en un passage exact avec ses positions (CA-1)', () => {
    const chunks = chunkText({ text: DEMO_NOTE });
    expect(chunks).toHaveLength(1);
    const chunk = chunks[0];
    expect(chunk).toBeDefined();
    if (chunk === undefined) return;
    expect(chunk.position).toBe(0);
    expect(chunk.location).toEqual({ charStart: 0, charEnd: DEMO_NOTE.length });
    expect(DEMO_NOTE.slice(chunk.location.charStart, chunk.location.charEnd)).toBe(chunk.text);
    expect(chunk.tokenCount).toBe(Math.ceil(chunk.text.length / 4));
  });

  it('respecte les paragraphes, la cible et le chevauchement avec des offsets exacts (ET-2)', () => {
    const paragraphs = Array.from(
      { length: 60 },
      (_, index) => `Paragraphe ${String(index)} : ${'débit crédit '.repeat(4)}`,
    );
    const text = paragraphs.join('\n\n');
    const chunks = chunkText({ text, targetTokens: 40, overlapTokens: 10 });

    expect(chunks.length).toBeGreaterThan(2);
    chunks.forEach((chunk, index) => {
      expect(chunk.position).toBe(index);
      expect(text.slice(chunk.location.charStart, chunk.location.charEnd)).toBe(chunk.text);
      expect(chunk.tokenCount).toBe(Math.ceil(chunk.text.length / 4));
      expect(chunk.location.charEnd).toBeGreaterThan(chunk.location.charStart);
    });
    for (let index = 1; index < chunks.length; index += 1) {
      const previous = chunks[index - 1];
      const current = chunks[index];
      if (previous === undefined || current === undefined) continue;
      // The overlap starts inside the previous passage and repeats whole paragraphs.
      expect(current.location.charStart).toBeGreaterThanOrEqual(previous.location.charStart);
      expect(current.location.charStart).toBeLessThan(previous.location.charEnd);
      const repeated = text.slice(current.location.charStart, previous.location.charEnd);
      expect(current.text.startsWith(repeated)).toBe(true);
      expect(repeated.length).toBeGreaterThan(0);
    }
  });

  it('découpe un paragraphe trop long sans perdre de caractère (ET-2)', () => {
    const text = 'Une phrase de contrôle. '.repeat(120);
    const chunks = chunkText({ text, targetTokens: 30, overlapTokens: 5 });
    expect(chunks.length).toBeGreaterThan(3);
    for (const chunk of chunks) {
      expect(text.slice(chunk.location.charStart, chunk.location.charEnd)).toBe(chunk.text);
    }
    expect(chunks[0]?.location.charStart).toBe(0);
    expect(chunks.at(-1)?.location.charEnd).toBeGreaterThanOrEqual(text.length - 1);
  });

  it('refuse un découpage incohérent avant toute écriture (ET-4)', () => {
    expect(() => chunkText({ text: '   ' })).toThrow(IngestionError);
    expect(() => chunkText({ text: 'abc', overlapTokens: 800 })).toThrow(/chevauchement/i);
    expect(() => chunkText({ text: 'abc', locations: [{ charStart: 0, charEnd: 9 }] })).toThrow(
      /dépasse/i,
    );
  });

  it('extrait une note en conservant ses positions et refuse une note vide (EF-2, CA-1)', () => {
    const note = 'Idée\n\nBrouillon avec accents : débit, crédit.';
    const extracted = extractNote(note);
    expect(extracted.pages).toBeNull();
    expect(extracted.locations).toEqual([{ charStart: 0, charEnd: note.length }]);
    expect(extracted.text).toBe(note);
    expect(() => extractNote('  \n ')).toThrow(/aucun texte/i);
    expect(() => extractNote(null)).toThrow(/aucun texte/i);
  });

  it('extrait un PDF page par page avec les accents et des offsets vérifiables (CA-1)', async () => {
    const extracted = await extractPdf(demoPdf());
    expect(extracted.pages).toBe(2);
    expect(extracted.locations.map((location) => location.page)).toEqual([1, 2]);
    expect(extracted.text).toContain('Le débit augmente les actifs');
    expect(extracted.text).toContain('Comptabilité générale');
    const [firstPage, secondPage] = extracted.locations;
    expect(firstPage).toBeDefined();
    expect(secondPage).toBeDefined();
    if (firstPage === undefined || secondPage === undefined) return;
    const firstText = extracted.text.slice(firstPage.charStart, firstPage.charEnd);
    const secondText = extracted.text.slice(secondPage.charStart, secondPage.charEnd);
    expect(firstText).toContain('Comptabilité générale');
    expect(firstText).not.toContain('Contrôle des comptes');
    expect(secondText).toContain('Contrôle des comptes');
    const chunks = chunkText({
      text: extracted.text,
      locations: extracted.locations,
      targetTokens: 20,
      overlapTokens: 3,
    });
    for (const chunk of chunks) {
      expect([1, 2]).toContain(chunk.location.page);
      expect(extracted.text.slice(chunk.location.charStart, chunk.location.charEnd)).toBe(
        chunk.text,
      );
    }
  });

  it('refuse un PDF vide, corrompu, trop lourd ou trop long (CL-1, CL-2)', async () => {
    await expect(codeOf(() => extractPdf(buildEmptyPdf()))).resolves.toBe('PDF_EMPTY_TEXT');
    await expect(codeOf(() => extractPdf(corruptedPdf()))).resolves.toBe('PDF_CORRUPTED');
    await expect(codeOf(() => extractPdf(new Uint8Array()))).resolves.toBe('PDF_CORRUPTED');
    await expect(
      codeOf(() => extractPdf(buildTextPdf([['a']]), { ...DEFAULT_PDF_LIMITS, maxBytes: 10 })),
    ).resolves.toBe('PDF_TOO_LARGE');
    await expect(
      codeOf(() => extractPdf(buildTextPdf([['a']]), { ...DEFAULT_PDF_LIMITS, maxPages: 0 })),
    ).resolves.toBe('PDF_TOO_MANY_PAGES');
  });

  it('produit un vecteur déterministe de 1024 dimensions, identique au mock partagé (CA-2)', () => {
    const first = fakeEmbedding('Le débit augmente les actifs.');
    const second = fakeEmbedding('Le débit augmente les actifs.');
    expect(first).toHaveLength(EMBEDDING_DIM);
    expect(first).toEqual(second);
    expect(first).toEqual(databaseFakeEmbedding('Le débit augmente les actifs.'));
    expect(fakeEmbedding('Le crédit augmente les passifs.')).not.toEqual(first);
    const norm = Math.sqrt(first.reduce((sum, value) => sum + value * value, 0));
    expect(Math.abs(norm - 1)).toBeLessThanOrEqual(1e-9);
    expect(toVectorLiteral([0.5, -1])).toBe('[0.5,-1]');
  });

  it('vectorise les passages dans l’ordre et vérifie exactement 1024 dimensions (CA-2, ET-2)', async () => {
    const texts = ['Premier passage.', 'Deuxième passage.'];
    const vectors = await embedTexts(mockEmbeddingClient(), texts);
    expect(vectors).toHaveLength(2);
    vectors.forEach((vector) => {
      expect(vector).toHaveLength(EMBEDDING_DIM);
    });
    expect(vectors[0]).toEqual(fakeEmbedding('Premier passage.'));

    const short: EmbeddingClient = { embed: () => Promise.resolve([[1, 2, 3]]) };
    await expect(codeOf(() => embedTexts(short, ['x']))).resolves.toBe('EMBEDDING_INVALID');
    const missing: EmbeddingClient = { embed: () => Promise.resolve([]) };
    await expect(codeOf(() => embedTexts(missing, ['x']))).resolves.toBe('EMBEDDING_INVALID');
  });

  it('aucun appel réseau en mode mock et reprise d’un Voyage indisponible (CL-3)', async () => {
    const outbound = vi.fn(() => Promise.reject(new Error('réseau interdit')));
    const client = defaultEmbeddingClient({ LLM_MODE: 'mock', VOYAGE_API_KEY: 'pa-test' });
    const vectors = await client.embed(['texte']);
    expect(vectors[0]).toHaveLength(EMBEDDING_DIM);

    const transient = voyageEmbeddingClient({
      apiKey: 'pa-test',
      fetchImplementation: outbound,
    });
    await expect(codeOf(() => transient.embed(['texte']))).resolves.toBe('EMBEDDING_UNAVAILABLE');

    const unavailable = voyageEmbeddingClient({
      apiKey: 'pa-test',
      fetchImplementation: () =>
        Promise.resolve(new Response('{"message":"busy"}', { status: 503 })),
    });
    let error: unknown;
    try {
      await unavailable.embed(['texte']);
    } catch (thrown) {
      error = thrown;
    }
    expect(error).toBeInstanceOf(IngestionError);
    expect((error as IngestionError).permanent).toBe(false);
    expect((error as IngestionError).code).toBe('EMBEDDING_UNAVAILABLE');

    const refused = voyageEmbeddingClient({
      apiKey: 'pa-test',
      fetchImplementation: () =>
        Promise.resolve(new Response('{"message":"bad key"}', { status: 401 })),
    });
    await expect(codeOf(() => refused.embed(['texte']))).resolves.toBe('EMBEDDING_KEY_INVALID');
  });

  it('valide l’identifiant d’apport avant tout accès à la base (ET-4)', async () => {
    const { ProcessResourceInput } = await import('@learny/contracts');
    expect(ProcessResourceInput.safeParse({ resourceId: UUID }).success).toBe(true);
    expect(ProcessResourceInput.safeParse({ resourceId: 'nope' }).success).toBe(false);
    expect(ProcessResourceInput.safeParse({ resourceId: UUID, extra: 1 }).success).toBe(false);
  });
});
