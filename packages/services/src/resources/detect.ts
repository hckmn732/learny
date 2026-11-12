// Real type and page count of an uploaded file (SPEC-206 ET-2, CL-2).
//
// The media type is read from the first bytes with `file-type`, never from the extension or from
// the `Content-Type` the client announced. PDF pages are counted by the PDF.js parser of `unpdf`
// (ADR-0057): the document is only opened, never rendered, and PDF.js runs no embedded script
// outside its viewer. Damaged, hostile or password-protected data is refused with `UNSUPPORTED_TYPE`.
import { fileTypeFromBuffer } from 'file-type';
import { getDocumentProxy } from 'unpdf';

import type { UploadFileKind } from '@learny/contracts';
import { AppError } from '@learny/core';

import { IMAGE_MIME_TYPES, PDF_MIME_TYPE, assertPdfPages } from './limits';

export interface DetectedFile {
  /** Real media type read from the signature. */
  mime: string;
  /** Page count of a PDF; `null` for an image. */
  pages: number | null;
}

const MISMATCH = 'Le contenu du fichier ne correspond pas au type annoncé.';

async function countPdfPages(bytes: Uint8Array): Promise<number> {
  let document;
  try {
    // PDF.js may transfer the buffer: it receives its own copy and the caller keeps the original.
    document = await getDocumentProxy(new Uint8Array(bytes), { verbosity: 0 });
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    throw new AppError(
      'UNSUPPORTED_TYPE',
      name === 'PasswordException'
        ? 'Ce PDF est protégé par un mot de passe : retirez la protection avant de l’envoyer.'
        : 'Ce PDF est illisible ou endommagé.',
      { cause: error },
    );
  }
  try {
    return document.numPages;
  } finally {
    await document.loadingTask.destroy();
  }
}

/**
 * EF-2 — checks the real bytes against the kind the resource was created for: signature first,
 * then (for a PDF) the page count. An executable renamed `.png`, a PNG sent as a PDF and a text
 * file are all `UNSUPPORTED_TYPE`; 501 pages are `UPLOAD_TOO_LARGE`.
 */
export async function detectUpload(bytes: Uint8Array, kind: UploadFileKind): Promise<DetectedFile> {
  const detected = await fileTypeFromBuffer(bytes);
  const mime = detected?.mime;
  if (kind === 'pdf') {
    if (mime !== PDF_MIME_TYPE) {
      throw new AppError(
        'UNSUPPORTED_TYPE',
        mime === undefined || !(IMAGE_MIME_TYPES as readonly string[]).includes(mime)
          ? 'Ce fichier n’est pas un PDF.'
          : MISMATCH,
      );
    }
    const pages = await countPdfPages(bytes);
    if (pages < 1) throw new AppError('UNSUPPORTED_TYPE', 'Ce PDF ne contient aucune page.');
    assertPdfPages(pages);
    return { mime, pages };
  }
  if (mime === undefined || !(IMAGE_MIME_TYPES as readonly string[]).includes(mime)) {
    throw new AppError(
      'UNSUPPORTED_TYPE',
      mime === PDF_MIME_TYPE
        ? MISMATCH
        : 'Ce fichier n’est pas une image JPEG, PNG, WebP ou HEIC valide.',
    );
  }
  return { mime, pages: null };
}
