// Contracts of the ingestion (SPEC-509 ET-4, CA-1 to CA-4).
import { describe, expect, it } from 'vitest';

import {
  INGESTION_ERROR_CODES,
  ImageExtraction,
  IngestionChunkLocation,
  IngestionOutcome,
  ProcessResourceInput,
  WebExtraction,
  YoutubeExtraction,
  YoutubeSegment,
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

describe('[SPEC-510] contrats des sources distantes', () => {
  it('valide une extraction web avec titre, texte, ancrages et URL finale (ET-2)', () => {
    const extraction = {
      title: 'Comptabilité de gestion',
      text: 'Le coût de revient regroupe les charges directes et indirectes.',
      anchors: [{ id: 'cout-de-revient', text: 'Coût de revient' }],
      sourceUrl: 'https://example.test/comptabilite',
      siteName: 'Exemple',
      language: 'fr',
    };
    expect(WebExtraction.safeParse(extraction).success).toBe(true);
    expect(
      WebExtraction.safeParse({ ...extraction, sourceUrl: 'javascript:alert(1)' }).success,
    ).toBe(false);
    expect(WebExtraction.safeParse({ ...extraction, anchors: [{ id: '' }] }).success).toBe(false);
  });

  it('valide des segments YouTube horodatés et refuse une plage inversée', () => {
    expect(YoutubeSegment.safeParse({ startSec: 12.5, endSec: 18, text: 'Bonjour' }).success).toBe(
      true,
    );
    expect(YoutubeSegment.safeParse({ startSec: 18, endSec: 12, text: 'Bonjour' }).success).toBe(
      false,
    );
    expect(
      YoutubeExtraction.safeParse({
        videoId: 'dQw4w9WgXcQ',
        title: 'Vidéo de fixture',
        language: 'fr',
        durationSec: 120,
        sourceUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        segments: [{ startSec: 0, endSec: 3, text: 'Bonjour' }],
      }).success,
    ).toBe(true);
    expect(
      YoutubeExtraction.safeParse({
        videoId: 'trop-court',
        title: 'Vidéo',
        language: 'fr',
        sourceUrl: 'https://youtu.be/x',
        segments: [],
      }).success,
    ).toBe(false);
  });

  it('marque une lecture d’image comme provenant du modèle light (EF-3)', () => {
    const reading = {
      title: 'Capture du compte 512',
      text: 'La capture montre un compte bancaire avec un solde débiteur.',
      origin: { task: 'light', provider: 'anthropic', modelId: 'claude-haiku-5-5' },
    };
    expect(ImageExtraction.safeParse(reading).success).toBe(true);
    expect(
      ImageExtraction.safeParse({
        ...reading,
        origin: { ...reading.origin, task: 'course' },
      }).success,
    ).toBe(false);
  });

  it('expose les codes de refus SSRF, robots, YouTube et image (CL-1 à CL-5)', () => {
    for (const code of [
      'URL_BLOCKED_HOST',
      'FETCH_TIMEOUT',
      'FETCH_TOO_LARGE',
      'ROBOTS_DISALLOWED',
      'YOUTUBE_NO_CAPTIONS',
      'IMAGE_VISION_UNAVAILABLE',
    ]) {
      expect(INGESTION_ERROR_CODES).toContain(code);
    }
  });
});
