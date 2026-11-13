// Contracts of the ingestion (SPEC-509 ET-4, CA-1 to CA-4).
import { describe, expect, it } from 'vitest';

import {
  INGESTION_ERROR_CODES,
  IngestionChunkLocation,
  IngestionOutcome,
  ProcessResourceInput,
} from './ingestion';

const RESOURCE = '00000000-0000-4000-8000-000000000509';

describe('[SPEC-509] contrats d’ingestion', () => {
  it('expose les codes d’erreur lisibles du traitement (BR-APP-07)', () => {
    expect(INGESTION_ERROR_CODES).toContain('PDF_EMPTY_TEXT');
    expect(INGESTION_ERROR_CODES).toContain('PDF_CORRUPTED');
    expect(INGESTION_ERROR_CODES).toContain('EMBEDDING_UNAVAILABLE');
    expect(new Set(INGESTION_ERROR_CODES).size).toBe(INGESTION_ERROR_CODES.length);
  });

  it('valide une position de passage et refuse une plage vide (BR-APP-06)', () => {
    expect(IngestionChunkLocation.safeParse({ page: 2, charStart: 10, charEnd: 42 }).success).toBe(
      true,
    );
    expect(IngestionChunkLocation.safeParse({ charStart: 10, charEnd: 10 }).success).toBe(false);
    expect(IngestionChunkLocation.safeParse({ page: 0, charStart: 0, charEnd: 2 }).success).toBe(
      false,
    );
  });

  it('valide le résultat d’un apport prêt, en échec ou ignoré', () => {
    const ready = {
      resourceId: RESOURCE,
      outcome: 'ready' as const,
      chunkCount: 3,
      embeddingCount: 3,
      errorCode: null,
      errorMessage: null,
    };
    expect(IngestionOutcome.safeParse(ready).success).toBe(true);
    expect(
      IngestionOutcome.safeParse({
        ...ready,
        outcome: 'failed',
        chunkCount: 0,
        errorCode: 'PDF_EMPTY_TEXT',
        errorMessage: 'Ce PDF ne contient aucun texte lisible.',
      }).success,
    ).toBe(true);
    expect(IngestionOutcome.safeParse({ ...ready, embeddingCount: -1 }).success).toBe(false);
    expect(IngestionOutcome.safeParse({ ...ready, errorCode: 'NOT_A_CODE' }).success).toBe(false);
  });

  it('n’accepte qu’un identifiant UUID pour lancer le traitement', () => {
    expect(ProcessResourceInput.safeParse({ resourceId: RESOURCE }).success).toBe(true);
    expect(ProcessResourceInput.safeParse({ resourceId: 'x' }).success).toBe(false);
  });
});
