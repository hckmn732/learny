// Pure helpers for the private storage layout of SPEC-114 (ET-3, CL-1, ADR-0249).
//
// An object is always stored as `<userId>/<uuid>/<name>`: the first segment binds the object to
// its owner, the second identifies the resource or export row, the third is a cleaned file name.
// Helpers reject anything that could escape the owner prefix or smuggle a separator, so callers
// never build a path by string concatenation.
import { AppError } from '@learny/core';

/** The only two buckets created by the storage migration (ADR-0058, ADR-0249). */
export const STORAGE_BUCKETS = {
  resources: 'resources',
  exports: 'exports',
} as const;

export type StorageBucket = (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

/** Number of segments in `<userId>/<uuid>/<name>`; `storage.foldername` sees two folders. */
export const STORAGE_PATH_SEGMENTS = 3;

/** Maximum length of the cleaned name, in characters (also bounded by the RLS policy). */
export const MAX_STORAGE_FILE_NAME_LENGTH = 200;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORBIDDEN_WINDOWS_CHARACTER = /[<>:"|?*]/g;
const ENCODED_SEPARATOR = /%(?:2f|5c|00)/i;
const PERCENT_ESCAPE = /%[0-9a-f]{2}/i;

/** Detects NUL and other C0/DEL control characters without a control-character regex. */
function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

function invalid(message: string): never {
  throw new AppError('VALIDATION_FAILED', message);
}

function assertUuid(value: string, label: string): string {
  if (typeof value !== 'string' || !UUID.test(value)) {
    invalid(`${label} invalide.`);
  }
  return value;
}

/**
 * Decodes percent escapes so encoded separators (`%2F`, `%5C`, `%00`) cannot hide a slash or NUL.
 * Bounded to three passes: beyond that a name is suspicious and is refused by the caller.
 */
function decodeName(name: string): string {
  let current = name;
  for (let pass = 0; pass < 3; pass += 1) {
    if (!PERCENT_ESCAPE.test(current)) return current;
    let next: string;
    try {
      next = decodeURIComponent(current);
    } catch {
      invalid('Nom de fichier invalide : encodage incomplet.');
    }
    if (next === current) return current;
    current = next;
  }
  if (PERCENT_ESCAPE.test(current)) {
    invalid('Nom de fichier invalide : encodage imbriqué.');
  }
  return current;
}

/**
 * Cleans an original file name: NFC normalization, rejection of traversal/separators/control
 * characters and of any percent-encoded separator, then removal of characters forbidden by
 * common filesystems. The result never contains `.`, `/` or `\` as a path component.
 */
export function normalizeStorageFileName(originalName: string): string {
  if (typeof originalName !== 'string') invalid('Nom de fichier invalide.');
  const source = originalName.normalize('NFC').trim();
  if (source === '' || source === '.' || source === '..') {
    invalid('Nom de fichier vide.');
  }
  if (hasControlCharacter(source)) {
    invalid('Nom de fichier invalide : caractère de contrôle.');
  }
  if (/[\\/]/.test(source) || ENCODED_SEPARATOR.test(source) || source.includes('..')) {
    invalid('Nom de fichier invalide : chemin relatif ou séparateur.');
  }

  const decoded = decodeName(source);
  if (
    decoded !== source &&
    (/[\\/]/.test(decoded) ||
      hasControlCharacter(decoded) ||
      ENCODED_SEPARATOR.test(decoded) ||
      decoded.includes('..'))
  ) {
    invalid('Nom de fichier invalide : séparateur encodé.');
  }

  const cleaned = decoded
    .replace(FORBIDDEN_WINDOWS_CHARACTER, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '');
  if (cleaned === '' || cleaned === '.' || cleaned === '..') {
    invalid('Nom de fichier vide.');
  }
  if (cleaned.length > MAX_STORAGE_FILE_NAME_LENGTH) {
    invalid('Nom de fichier trop long.');
  }
  return cleaned;
}

/** Builds the storage path of one resource apport: `<userId>/<resourceId>/<cleaned name>`. */
export function resourcePath(userId: string, resourceId: string, originalName: string): string {
  return `${assertUuid(userId, 'Identifiant utilisateur')}/${assertUuid(
    resourceId,
    'Identifiant de ressource',
  )}/${normalizeStorageFileName(originalName)}`;
}

/** Builds the storage path of one personal data export; the default name is fixed. */
export function exportPath(userId: string, exportId: string, originalName = 'export.zip'): string {
  return `${assertUuid(userId, 'Identifiant utilisateur')}/${assertUuid(
    exportId,
    'Identifiant d’export',
  )}/${normalizeStorageFileName(originalName)}`;
}

export interface OwnedStoragePath {
  userId: string;
  /** Resource or export identifier, second segment of the path. */
  objectId: string;
  /** Cleaned file name, third segment of the path. */
  name: string;
  path: string;
}

export function isStorageUuid(value: string): boolean {
  return UUID.test(value);
}

/**
 * Parses an existing path and returns it only when every segment is valid and the first segment
 * is exactly the given user. Anything else returns `null`, so callers cannot distinguish an invalid
 * path from another user's path (EF-6, CL-2).
 */
export function parseOwnedPath(path: string, userId: string): OwnedStoragePath | null {
  if (typeof path !== 'string' || typeof userId !== 'string' || !UUID.test(userId)) return null;
  const segments = path.split('/');
  if (segments.length !== STORAGE_PATH_SEGMENTS) return null;
  const [owner, objectId, rawName] = segments;
  if (owner !== userId || objectId === undefined || rawName === undefined) return null;
  if (!UUID.test(objectId)) return null;
  let name: string;
  try {
    name = normalizeStorageFileName(rawName);
  } catch {
    return null;
  }
  // A cleaned name that differs from the stored one means the path was not built by these helpers
  // (encoded separator, control character, traversal): refuse it instead of silently normalising.
  if (name !== rawName || path.includes('..')) return null;
  return { userId, objectId, name, path };
}
