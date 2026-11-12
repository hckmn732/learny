import { z } from 'zod';

import { Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the global search (SPEC-212 ET-1; BR-NAV-05, ADR-0062, ADR-0217).
//
// The query is normalized (NFKC, collapsed whitespace, trim) before its length is checked, so the
// bounds count what the search engine receives. The refusal messages are the ones of the interface
// (EF-1) and are shown as they are by the search field (SPEC-307).

export const SEARCH_QUERY_MIN_LENGTH = 2;
export const SEARCH_QUERY_MAX_LENGTH = 100;
export const SEARCH_DEFAULT_LIMIT = 5;
export const SEARCH_MAX_LIMIT = 20;
/** EF-4 — a snippet is plain text of at most this many characters, ellipses included. */
export const SEARCH_SNIPPET_MAX_LENGTH = 160;

export const SEARCH_TOO_SHORT_MESSAGE = 'Saisissez au moins 2 caractères.';
export const SEARCH_TOO_LONG_MESSAGE = 'Recherche limitée à 100 caractères.';

/** EF-2 — fixed order of the groups, and the label shown for each. */
export const SEARCH_KINDS = ['notion', 'chapter', 'formation'] as const;
export const SearchKind = z.enum(SEARCH_KINDS);
export type SearchKind = z.infer<typeof SearchKind>;

export const SEARCH_GROUP_LABELS: Record<SearchKind, string> = {
  notion: 'Notions',
  chapter: 'Chapitres',
  formation: 'Formations',
};

/** EF-1 — NFKC, repeated whitespace reduced to one space, trimmed. */
export function normalizeSearchText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

/**
 * EF-1 — `q` is normalized first, then bounded to 2–100 characters (code points, so an emoji
 * counts for one). The parsed value is the normalized text.
 */
export const SearchQueryText = z
  .string()
  .describe('Texte recherché : de 2 à 100 caractères après normalisation (NFKC, espaces réduits).')
  .transform((value) => normalizeSearchText(value))
  .pipe(
    z
      .string()
      .refine((value) => Array.from(value).length >= SEARCH_QUERY_MIN_LENGTH, {
        message: SEARCH_TOO_SHORT_MESSAGE,
      })
      .refine((value) => Array.from(value).length <= SEARCH_QUERY_MAX_LENGTH, {
        message: SEARCH_TOO_LONG_MESSAGE,
      }),
  );

export const SearchQuery = z.object({
  q: SearchQueryText,
  limit: z.coerce
    .number()
    .int()
    .min(1, { message: 'La limite doit être comprise entre 1 et 20.' })
    .max(SEARCH_MAX_LIMIT, { message: 'La limite doit être comprise entre 1 et 20.' })
    .default(SEARCH_DEFAULT_LIMIT),
});
export type SearchQuery = z.infer<typeof SearchQuery>;

/** EF-4 — a highlight is the half-open range `[start, end[` of UTF-16 units in a text. */
export const Highlight = z
  .object({ start: z.number().int().min(0), end: z.number().int().min(1) })
  .refine((range) => range.end > range.start, { message: 'Une plage de surlignage est vide.' });
export type Highlight = z.infer<typeof Highlight>;

/** EF-5 — an internal path in French (ADR-0046): relative, starting with a single `/`. */
export const InternalHref = z
  .string()
  .min(1)
  .max(500)
  .refine((value) => value.startsWith('/') && !value.startsWith('//') && !value.includes('\\'), {
    message: 'Un lien interne est un chemin relatif commençant par « / ».',
  });

export const SearchItem = z.object({
  id: Uuid,
  title: z.string(),
  /** Plain text, 160 characters at most; never HTML (EF-4, ET-4). */
  snippet: z.string().max(SEARCH_SNIPPET_MAX_LENGTH),
  /** Positions of the matches in `snippet`. */
  highlights: z.array(Highlight),
  /** Positions of the matches in `title`. */
  titleHighlights: z.array(Highlight),
  href: InternalHref,
});
export type SearchItem = z.infer<typeof SearchItem>;

export const SearchGroup = z.object({
  kind: SearchKind,
  label: z.string(),
  items: z.array(SearchItem),
  /** Rows of this kind returned by the search function, before the cut to `limit` (EF-3). */
  total: z.number().int().min(0),
});
export type SearchGroup = z.infer<typeof SearchGroup>;

export const SearchResponse = z.object({
  /** The normalized query that was run. */
  query: z.string(),
  groups: z.array(SearchGroup),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

export const searchGlobal = defineRoute({
  id: 'search.global',
  method: 'GET',
  path: '/api/v1/search',
  auth: 'user',
  query: SearchQuery,
  output: SearchResponse,
  successStatus: 200,
  rateLimit: 'default',
  summary:
    'Recherche globale dans les notions, chapitres et formations de l’apprenant : résultats groupés, extraits en texte brut et positions de surlignage (SPEC-212).',
  errors: ['VALIDATION_FAILED', 'UNAUTHENTICATED', 'RATE_LIMITED'],
});

export const searchRoutes = { searchGlobal } as const;
