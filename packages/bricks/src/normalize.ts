// Text normalization shared by fingerprints, cloze correction and bank deduplication (ADR-0151,
// BR-MEM-05). The steps and their order are normative:
//   1. NFKC; 2. typographic apostrophes/quotes/dashes/spaces to ASCII; 3. lower case;
//   4. NFD, remove diacritics, NFC; 5. collapse whitespace; 6. trim; 7. drop trailing punctuation.
// The function is idempotent: normalizeText(normalizeText(s)) === normalizeText(s).

const TYPOGRAPHIC_REPLACEMENTS: ReadonlyArray<readonly [RegExp, string]> = [
  [/[\u2019\u2018\u201B\u02BC]/g, "'"],
  [/[\u00AB\u00BB\u201C\u201D\u201E]/g, '"'],
  [/[\u2010\u2011\u2013\u2014]/g, '-'],
  [/[\u00A0\u2009\u202F]/g, ' '],
];

export function normalizeText(value: string): string {
  let text = value.normalize('NFKC');
  for (const [pattern, replacement] of TYPOGRAPHIC_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  text = text.toLowerCase();
  text = text.normalize('NFD').replace(/\p{M}/gu, '').normalize('NFC');
  text = text.replace(/\s+/gu, ' ').trim();
  return text.replace(/[.?!:;\u2026]+$/gu, '').trim();
}

/** Normalized comparison key of free text; always case- and accent-insensitive (BR-MEM-05). */
export function comparisonKey(value: string): string {
  return normalizeText(value);
}
