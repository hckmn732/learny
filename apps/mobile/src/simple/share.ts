// Réception d'un partage vers Learny (SPEC-4003 EF-3, ET-3 ; CA-2).
//
// Android delivers a share as an `ACTION_SEND` intent whose `data` may carry the document URI;
// iOS delivers an « Ouvrir avec » as a `file://` URL. Expo Linking exposes that URI, and this
// module turns it into the descriptor the deposit screen adds to the queue. The parser is pure:
// an unsupported URI, a missing name or a non-document type yields `null`, never a crash.
import { simpleExtension, simpleMimeOf } from './mime';

/** A document received from another application. */
export interface SharedFile {
  readonly uri: string;
  readonly name: string;
  readonly mime: string;
  readonly sizeBytes: number;
}

const DOCUMENT_SCHEMES = ['file:', 'content:', 'assets-library:'];

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function nameFromPath(path: string): string {
  const segment =
    path
      .split('/')
      .filter((part) => part !== '')
      .pop() ?? '';
  return safeDecode(segment);
}

/**
 * Lit un URI de partage. Accepte le schéma interne (`learny://partage?uri=…&name=…&type=…`) que
 * le pont natif peut produire, puis `content://`, `file://` et `assets-library://` d'iOS.
 */
export function parseSharedUri(raw: string | null | undefined): SharedFile | null {
  if (raw === null || raw === undefined) return null;
  const value = raw.trim();
  if (value === '') return null;

  if (value.startsWith('learny://partage')) {
    const query = value.includes('?') ? value.slice(value.indexOf('?') + 1) : '';
    const params = new URLSearchParams(query);
    const uri = params.get('uri');
    if (uri === null || uri === '') return null;
    const name = params.get('name') ?? nameFromPath(uri);
    const mime = params.get('type') ?? simpleMimeOf(name);
    if (mime === null) return null;
    return {
      uri,
      name: name === '' ? `Document partagé.${simpleExtension(mime)}` : name,
      mime,
      sizeBytes: Number(params.get('size') ?? 0) || 0,
    };
  }

  if (!DOCUMENT_SCHEMES.some((scheme) => value.startsWith(scheme))) return null;
  const withoutQuery = value.split('?')[0] ?? value;
  const name = nameFromPath(withoutQuery);
  // iOS « Ouvrir avec » passe par `…/Inbox/<nom>` : le nom reste le dernier segment.
  const mime = simpleMimeOf(name);
  if (mime === null) return null;
  return { uri: value, name, mime, sizeBytes: 0 };
}
