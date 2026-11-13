// Note extractor (SPEC-509 EF-2, ET-2).
//
// A note is already text: nothing is normalized, so every character range stays true to the
// learner's contribution and the passages can quote the exact excerpt (CA-1). An empty note or a
// note beyond the coded limit is a permanent, readable failure.
import { RESOURCE_LIMITS } from '@learny/config';

import { IngestionError } from '../errors';

import type { ExtractedContent } from './types';

export function extractNote(content: string | null): ExtractedContent {
  if (content === null || content.trim() === '') {
    throw new IngestionError(
      'NOTE_EMPTY',
      'Cette note ne contient aucun texte : ajoutez du contenu avant de la traiter.',
    );
  }
  if (content.length > RESOURCE_LIMITS.noteMaxChars) {
    throw new IngestionError(
      'NOTE_TOO_LARGE',
      `Cette note dépasse la limite de ${String(RESOURCE_LIMITS.noteMaxChars)} caractères.`,
    );
  }
  return {
    text: content,
    pages: null,
    locations: [{ charStart: 0, charEnd: content.length }],
  };
}
