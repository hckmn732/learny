// PDF extractor (SPEC-509 EF-2, ET-2, CL-1, CL-2; ADR-0057).
//
// `unpdf` (PDF.js) reads the text of each page; no rendering, no embedded script execution. A
// password-protected document, a damaged file, a page beyond BR-APP-02 or a document without any
// text becomes a safe, named failure and never a partial set of passages. The page coordinates
// are preserved so a citation always points to the exact page and character range.
import { extractText, getDocumentProxy } from 'unpdf';

import { RESOURCE_LIMITS } from '@learny/config';

import { IngestionError } from '../errors';

import type { ExtractedContent, PdfLimits } from './types';

export const DEFAULT_PDF_LIMITS: PdfLimits = {
  maxBytes: RESOURCE_LIMITS.pdfMaxBytes,
  maxPages: RESOURCE_LIMITS.pdfMaxPages,
  noteMaxCharacters: RESOURCE_LIMITS.noteMaxChars,
};

function parseError(error: unknown): IngestionError {
  const name = error instanceof Error ? error.name : '';
  if (name === 'PasswordException') {
    return new IngestionError(
      'PDF_ENCRYPTED',
      'Ce PDF est protégé par un mot de passe : retirez la protection avant de l’envoyer.',
      { cause: error },
    );
  }
  return new IngestionError(
    'PDF_CORRUPTED',
    'Ce PDF est illisible ou endommagé : vérifiez le fichier puis envoyez-le de nouveau.',
    { cause: error },
  );
}

/**
 * EF-2 — extracts the text of a PDF page by page. `text` concatenates the pages with two newlines
 * and every page location gives the absolute `{charStart, charEnd}` of its text.
 */
export async function extractPdf(
  bytes: Uint8Array,
  limits: PdfLimits = DEFAULT_PDF_LIMITS,
): Promise<ExtractedContent> {
  if (bytes.length > limits.maxBytes) {
    throw new IngestionError(
      'PDF_TOO_LARGE',
      `Ce PDF dépasse la limite de ${String(Math.floor(limits.maxBytes / 1_048_576))} Mo.`,
    );
  }
  if (bytes.length === 0) {
    throw new IngestionError(
      'PDF_CORRUPTED',
      'Ce PDF est vide ou endommagé : envoyez-le de nouveau.',
    );
  }

  let document;
  try {
    document = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
  } catch (error) {
    throw parseError(error);
  }
  try {
    if (document.numPages > limits.maxPages) {
      throw new IngestionError(
        'PDF_TOO_MANY_PAGES',
        `Ce PDF dépasse la limite de ${String(limits.maxPages)} pages.`,
      );
    }
    const extracted = await extractText(document, { mergePages: false });
    const pageTexts = Array.isArray(extracted.text) ? extracted.text : [extracted.text];
    let text = '';
    const locations: ExtractedContent['locations'] = [];
    pageTexts.forEach((pageText, index) => {
      if (pageText.trim() !== '') {
        const charStart = text.length;
        text += pageText;
        locations.push({ page: index + 1, charStart, charEnd: text.length });
      }
      if (index < pageTexts.length - 1) text += '\n\n';
    });
    if (locations.length === 0) {
      throw new IngestionError(
        'PDF_EMPTY_TEXT',
        'Ce PDF ne contient aucun texte lisible (pages scannées ?) : ajoutez une version texte.',
      );
    }
    return { text, pages: document.numPages, locations };
  } catch (error) {
    if (error instanceof IngestionError) throw error;
    throw parseError(error);
  } finally {
    await document.loadingTask.destroy();
  }
}
