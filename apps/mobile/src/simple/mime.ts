// Types de documents acceptés par le mode simple (SPEC-4003 EF-2, ET-3 ; BR-APP-02).
//
// The picker filters on the same list; the API remains the authority on size, page count and real
// type. A name without extension is accepted only when the caller supplies the MIME type.
export const SIMPLE_MIME_TYPES = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  txt: 'text/plain',
  md: 'text/markdown',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  heic: 'image/heic',
} as const;

/** MIME picker filter of the document selector (Android and iOS). */
export const DOCUMENT_PICKER_TYPES = [
  SIMPLE_MIME_TYPES.pdf,
  SIMPLE_MIME_TYPES.docx,
  SIMPLE_MIME_TYPES.txt,
  SIMPLE_MIME_TYPES.md,
  'image/*',
];

/** MIME of a file name, or `null` when the extension is not a document the mode accepts. */
export function simpleMimeOf(name: string): string | null {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return (SIMPLE_MIME_TYPES as Record<string, string | undefined>)[extension] ?? null;
}

/** Extension to give a shared image without a name. */
export function simpleExtension(mime: string): string {
  if (mime === SIMPLE_MIME_TYPES.pdf) return 'pdf';
  if (mime === SIMPLE_MIME_TYPES.docx) return 'docx';
  if (mime === SIMPLE_MIME_TYPES.txt) return 'txt';
  if (mime === SIMPLE_MIME_TYPES.md) return 'md';
  if (mime === SIMPLE_MIME_TYPES.png) return 'png';
  if (mime === SIMPLE_MIME_TYPES.webp) return 'webp';
  if (mime === SIMPLE_MIME_TYPES.heic) return 'heic';
  return 'jpg';
}

/** Vrai pour une image : le rôle par défaut d'une photo de page. */
export function isImageMime(mime: string): boolean {
  return mime.startsWith('image/');
}
