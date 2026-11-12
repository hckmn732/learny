// Pure upload rules of BR-APP-02 (SPEC-206 EF-6, ET-2, CL-1 to CL-3, ADR-0039).
//
// Every bound comes from `RESOURCE_LIMITS` (`@learny/config`): no business value is written here
// or in a route handler (SPEC-009). The functions throw `AppError` with a stable code and an
// explicit French message, before the object is accepted for good (BR-APP-02).
import { RESOURCE_LIMITS } from '@learny/config';
import type { UploadFileKind } from '@learny/contracts';
import { AppError } from '@learny/core';

/** Real image formats of BR-APP-02: JPEG, PNG, WebP and HEIC (HEIF is the same container). */
export const IMAGE_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const;

export const PDF_MIME_TYPE = 'application/pdf';

export { DELETED_SOURCE_LABEL } from '@learny/contracts';

const MEGABYTE = 1024 * 1024;

function groupThousands(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/** `52428800` → `50 Mo`, for the messages of the refusals. */
function formatMegabytes(bytes: number): string {
  return `${String(Math.round(bytes / MEGABYTE))} Mo`;
}

export function sizeLimitBytes(kind: UploadFileKind): number {
  return kind === 'pdf' ? RESOURCE_LIMITS.pdfMaxBytes : RESOURCE_LIMITS.imageMaxBytes;
}

/** Media type without its parameters, lower-cased (`Image/PNG; foo=bar` → `image/png`). */
function normalizeMime(mime: string): string {
  return (mime.split(';')[0] ?? '').trim().toLowerCase();
}

/**
 * EF-1, ET-7 — the kind a declared media type announces. Audio and video exist in the database
 * enumerations but are refused in V1 (ADR-0008); anything else is not a supported contribution.
 */
export function kindForDeclaredMime(mime: string): UploadFileKind {
  const type = normalizeMime(mime);
  if (type === PDF_MIME_TYPE) return 'pdf';
  if ((IMAGE_MIME_TYPES as readonly string[]).includes(type)) return 'image';
  if (type.startsWith('audio/') || type.startsWith('video/')) {
    throw new AppError(
      'UNSUPPORTED_TYPE',
      'Les fichiers audio et vidéo ne sont pas pris en charge dans cette version.',
    );
  }
  throw new AppError(
    'UNSUPPORTED_TYPE',
    'Type de fichier non pris en charge : seuls les PDF et les images JPEG, PNG, WebP ou HEIC sont acceptés.',
  );
}

/** CL-1, CL-2 — a file up to the bound is accepted, one byte beyond is refused. */
export function assertFileSize(kind: UploadFileKind, sizeBytes: number): void {
  if (sizeBytes > sizeLimitBytes(kind)) {
    const subject = kind === 'pdf' ? 'Un PDF' : 'Une image';
    throw new AppError(
      'UPLOAD_TOO_LARGE',
      `${subject} ne peut pas dépasser ${formatMegabytes(sizeLimitBytes(kind))}.`,
    );
  }
}

/** CL-1 — 500 pages exactly are accepted, 501 are refused. */
export function assertPdfPages(pages: number): void {
  if (pages > RESOURCE_LIMITS.pdfMaxPages) {
    throw new AppError(
      'UPLOAD_TOO_LARGE',
      `Un PDF ne peut pas dépasser ${String(RESOURCE_LIMITS.pdfMaxPages)} pages.`,
    );
  }
}

/** Characters, as the database counts them (`char_length`): one per code point. */
export function countCharacters(text: string): number {
  let count = 0;
  for (let index = 0; index < text.length; index += 1) {
    // A surrogate pair is one character: skip its second half.
    if ((text.codePointAt(index) ?? 0) > 0xffff) index += 1;
    count += 1;
  }
  return count;
}

/** EF-3 — 100 000 characters exactly are accepted. */
export function assertNoteText(text: string): void {
  if (countCharacters(text) > RESOURCE_LIMITS.noteMaxChars) {
    throw new AppError(
      'UPLOAD_TOO_LARGE',
      `Une note ne peut pas dépasser ${groupThousands(RESOURCE_LIMITS.noteMaxChars)} caractères.`,
    );
  }
}

export interface Capacity {
  /** Live contributions already in the chapter, the one being added excluded. */
  chapterCount: number;
  /** Finalized bytes plus live reservations of the owner, the one being added excluded. */
  usedBytes: number;
  /** Bytes the contribution adds (0 for a note). */
  addedBytes: number;
}

/** EF-6, CL-3 — 100 contributions per chapter and 2 GB per learner. */
export function assertCapacity(capacity: Capacity): void {
  if (capacity.chapterCount >= RESOURCE_LIMITS.perChapter) {
    throw new AppError(
      'QUOTA_EXCEEDED',
      `Ce chapitre contient déjà ${String(RESOURCE_LIMITS.perChapter)} apports : supprimez-en un avant d’en ajouter.`,
    );
  }
  if (capacity.usedBytes + capacity.addedBytes > RESOURCE_LIMITS.userQuotaBytes) {
    throw new AppError(
      'QUOTA_EXCEEDED',
      `Votre espace de stockage de ${String(Math.round(RESOURCE_LIMITS.userQuotaBytes / (MEGABYTE * 1024)))} Go est plein : supprimez des apports pour libérer de la place.`,
    );
  }
}

export interface DeclaredUpload {
  mime: string;
  sizeBytes: number;
}

/** Declared values of an upload request: type first, then size (EF-1). Returns the kind. */
export function assertDeclaredUpload(upload: DeclaredUpload): UploadFileKind {
  const kind = kindForDeclaredMime(upload.mime);
  assertFileSize(kind, upload.sizeBytes);
  return kind;
}

export interface UploadSimulation extends DeclaredUpload, Capacity {
  /** Measured page count of a PDF; absent for an image. */
  pages?: number;
}

/**
 * Whole decision of the service on simulated inputs: the SDD page (EF-7) and the unit tests run
 * exactly the checks the real flow runs, in the same order (type, size, pages, capacity).
 */
export function evaluateUpload(input: UploadSimulation): UploadFileKind {
  const kind = assertDeclaredUpload(input);
  if (kind === 'pdf' && input.pages !== undefined) assertPdfPages(input.pages);
  assertCapacity({
    chapterCount: input.chapterCount,
    usedBytes: input.usedBytes,
    addedBytes: input.addedBytes,
  });
  return kind;
}
