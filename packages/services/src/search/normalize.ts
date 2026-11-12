// Normalization and accent/case folding of the global search (SPEC-212 ET-3; BR-NAV-05, ADR-0217).
//
// `normalizeQuery` is what the search engine receives: NFKC, repeated whitespace reduced to one
// space, trimmed. `fold` is the comparison form used by the highlighting: lower case, diacritics
// removed. Both are pure and deterministic; the same function folds the query and the text, so a
// match found here is a match the learner sees (« reseau » highlights « Réseau », « RÉSEAU »).
import { normalizeSearchText } from '@learny/contracts';

/** EF-1 — NFKC, collapsed whitespace, trim. The 2–100 bounds are enforced by the contract. */
export function normalizeQuery(q: string): string {
  return normalizeSearchText(q);
}

/** Non-spacing marks left by the canonical decomposition: accents, cedillas, tildes, diaeresis. */
const DIACRITICS = /\p{Mn}/gu;

/**
 * Folds one code point: lower case, canonical decomposition, diacritics removed. A combining mark
 * on its own folds to the empty string. Context-free on purpose (no final sigma rule) so that the
 * fold of a text equals the concatenation of the folds of its code points, which the highlight
 * mapping relies on.
 */
export function foldCodePoint(codePoint: string): string {
  return codePoint.toLowerCase().normalize('NFD').replace(DIACRITICS, '');
}

/** ET-3 — NFD, diacritics removed, lower case. `fold('Réseau')` is `'reseau'`. */
export function fold(text: string): string {
  let folded = '';
  for (const codePoint of text) folded += foldCodePoint(codePoint);
  return folded;
}

/**
 * The words the highlighter looks for: the folded query split on spaces, deduplicated. A one-letter
 * word is ignored when the query has a longer one (« reseau a » must not light up every « a »).
 */
export function queryTerms(query: string): string[] {
  const words = [
    ...new Set(
      fold(normalizeQuery(query))
        .split(' ')
        .filter((word) => word !== ''),
    ),
  ];
  const long = words.filter((word) => Array.from(word).length >= 2);
  return long.length > 0 ? long : words;
}
