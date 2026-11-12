// Plain-text snippets and highlight positions of the global search (SPEC-212 EF-4, ET-3, ET-4;
// CL-2, CL-7, CL-8; ADR-0217).
//
// A snippet is plain text of at most 160 characters, ellipses included, centred on the first
// match, and never contains markup: tags, entities, Markdown syntax and angle brackets are
// removed. Highlights are half-open ranges `[start, end[` of UTF-16 units in the text that is
// returned (NFC), computed on the folded text so that case and accents never matter, and never
// split a surrogate pair or a combining sequence.
import { SEARCH_SNIPPET_MAX_LENGTH, type Highlight } from '@learny/contracts';

import { foldCodePoint, queryTerms } from './normalize';

export const ELLIPSIS = '…';

/** How far a cut may move to reach a word boundary without losing too much text. */
const WORD_SNAP = 15;

/** A mark that combines with the previous character: it must stay attached to it. */
const COMBINING = /^\p{Mn}$/u;

const BLOCK_TAGS =
  /<\/?(?:address|article|aside|blockquote|body|br|dd|details|div|dl|dt|figcaption|figure|footer|h[1-6]|header|hr|html|li|main|nav|ol|p|pre|section|summary|table|tbody|td|tfoot|th|thead|tr|ul)\b[^>]*>/gi;

/**
 * Removes comments, script and style blocks (content included), then tags: a block tag separates
 * words, an inline tag does not (« <b>réseau</b>x » stays one word).
 */
function stripMarkup(text: string): string {
  return text
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(BLOCK_TAGS, ' ')
    .replace(/<\/?[A-Za-z!?][^>]*>/g, '');
}

interface FoldedText {
  folded: string;
  /** For every UTF-16 unit of `folded`: the range of the source character that produced it. */
  starts: number[];
  ends: number[];
}

/** Folds `text` code point by code point, remembering where every folded unit comes from. */
function foldWithMap(text: string): FoldedText {
  let folded = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let lastCharFirstUnit = -1;
  let index = 0;
  for (const codePoint of text) {
    const next = index + codePoint.length;
    const piece = foldCodePoint(codePoint);
    if (piece === '') {
      // A combining mark folds to nothing: it stays attached to the previous character.
      for (let unit = lastCharFirstUnit; unit >= 0 && unit < ends.length; unit += 1) {
        ends[unit] = next;
      }
    } else {
      lastCharFirstUnit = starts.length;
      for (let unit = 0; unit < piece.length; unit += 1) {
        starts.push(index);
        ends.push(next);
      }
      folded += piece;
    }
    index = next;
  }
  return { folded, starts, ends };
}

/**
 * ET-3 — positions `[start, end[` of every occurrence of the query words in `text`, ignoring case
 * and accents, merged when they overlap or touch, sorted. The positions are those of
 * `text.normalize('NFC')`: the character-by-character correspondence holds after NFC, so callers
 * work on NFC text (the API always returns NFC text).
 */
export function computeHighlights(text: string, query: string): Highlight[] {
  const terms = queryTerms(query);
  if (terms.length === 0) return [];
  const { folded, starts, ends } = foldWithMap(text.normalize('NFC'));
  const found: Highlight[] = [];
  for (const term of terms) {
    let from = 0;
    for (;;) {
      const at = folded.indexOf(term, from);
      if (at < 0) break;
      const first = starts[at];
      const last = ends[at + term.length - 1];
      if (first !== undefined && last !== undefined && last > first) {
        found.push({ start: first, end: last });
      }
      from = at + term.length;
    }
  }
  found.sort((left, right) => left.start - right.start || right.end - left.end);
  const merged: Highlight[] = [];
  for (const range of found) {
    const previous = merged[merged.length - 1];
    if (previous !== undefined && range.start <= previous.end) {
      previous.end = Math.max(previous.end, range.end);
    } else {
      merged.push({ ...range });
    }
  }
  return merged;
}

/**
 * ET-4 — removes whatever could be taken for markup: script and style blocks with their content,
 * comments, tags, entities, fenced and inline code marks, Markdown headings, emphasis, quotes,
 * list bullets, tables and links (reduced to their text), then every remaining angle bracket.
 * Whitespace is collapsed and the result is NFC and trimmed.
 */
export function toPlainText(value: string | null | undefined): string {
  const text = stripMarkup((value ?? '').normalize('NFC'))
    // Fenced code: keep the code, drop the fences and the language tag.
    .replace(/^[ \t]*(`{3,}|~{3,})[^\n]*$/gm, ' ')
    // Images and links keep their text; reference definitions disappear.
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
    .replace(/^[ \t]*\[[^\]]+\]:[ \t]*\S+.*$/gm, ' ')
    // Block syntax.
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm, '')
    .replace(/^[ \t]*>+[ \t]?/gm, '')
    .replace(/^[ \t]*[-*+][ \t]+/gm, '')
    .replace(/^[ \t]*\d+[.)][ \t]+/gm, '')
    .replace(/^[ \t]*([-*_][ \t]*){3,}$/gm, ' ')
    .replace(/^[ \t]*\|?[ \t]*:?-{2,}:?([ \t]*\|[ \t]*:?-{2,}:?)*[ \t]*\|?[ \t]*$/gm, ' ')
    .replace(/\|/g, ' ')
    // Inline syntax: emphasis, strike-through and code.
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^\w])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1$2')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
    .replace(/`+/g, '')
    // Entities, then every angle bracket that survived (`a < b`).
    .replace(/&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, ' ')
    .replace(/[<>]/g, ' ');
  return text.replace(/\s+/g, ' ').trim().normalize('NFC');
}

/**
 * A title is a short plain text: markup characters go, Markdown syntax is left alone (a title
 * such as « C++ *args » is not emphasis).
 */
export function toPlainTitle(value: string | null | undefined): string {
  return stripMarkup((value ?? '').normalize('NFC'))
    .replace(/&(?:#[0-9]+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isWhitespace(char: string | undefined): boolean {
  return char === undefined || /\s/.test(char);
}

function isLowSurrogate(unit: string | undefined): boolean {
  if (unit === undefined) return false;
  const code = unit.charCodeAt(0);
  return code >= 0xdc00 && code <= 0xdfff;
}

function isHighSurrogate(unit: string | undefined): boolean {
  if (unit === undefined) return false;
  const code = unit.charCodeAt(0);
  return code >= 0xd800 && code <= 0xdbff;
}

/**
 * EF-4 — the `[start, end[` window of `plain` shown as a snippet: `max` characters at most,
 * centred on the anchor, room kept for one ellipsis per cut side, cuts moved to a word boundary
 * when one is close, never inside a surrogate pair or before a combining mark.
 */
function windowAround(plain: string, anchor: Highlight | undefined, max: number) {
  const length = plain.length;
  const anchorStart = anchor?.start ?? 0;
  const anchorEnd = anchor === undefined ? 0 : Math.min(anchor.end, anchorStart + max - 2);
  let lead = false;
  let trail = false;
  let start = 0;
  let end = Math.min(length, max);
  for (let pass = 0; pass < 3; pass += 1) {
    const budget = max - (lead ? 1 : 0) - (trail ? 1 : 0);
    start = Math.max(0, anchorStart - Math.floor((budget - (anchorEnd - anchorStart)) / 2));
    end = start + budget;
    if (end > length) {
      end = length;
      start = Math.max(0, end - budget);
    }
    const nextLead = start > 0;
    const nextTrail = end < length;
    if (nextLead === lead && nextTrail === trail) break;
    lead = nextLead;
    trail = nextTrail;
  }
  lead = start > 0;
  trail = end < length;

  if (lead && !isWhitespace(plain[start - 1]) && !isWhitespace(plain[start])) {
    const space = plain.indexOf(' ', start);
    if (space >= 0 && space - start <= WORD_SNAP && space + 1 <= anchorStart) start = space + 1;
  }
  if (trail && !isWhitespace(plain[end]) && !isWhitespace(plain[end - 1])) {
    const space = plain.lastIndexOf(' ', end - 1);
    if (space >= 0 && end - space <= WORD_SNAP && space >= anchorEnd) end = space;
  }
  if (lead) {
    while (start < end && (isLowSurrogate(plain[start]) || COMBINING.test(plain[start] ?? ''))) {
      start += 1;
    }
  }
  if (trail && end > start && isHighSurrogate(plain[end - 1])) end -= 1;
  return { start, end, lead: start > 0, trail: end < length };
}

export interface BuiltSnippet {
  snippet: string;
  highlights: Highlight[];
}

/**
 * EF-4, ET-4, CL-7 — turns a source text (description, definition, Markdown or HTML course
 * content) into the snippet of a result: plain text, 160 characters at most, centred on the first
 * match with « … » at the cuts, plus the highlights found in that very text.
 */
export function buildSnippet(source: string | null | undefined, query: string): BuiltSnippet {
  const plain = toPlainText(source);
  const max = SEARCH_SNIPPET_MAX_LENGTH;
  if (plain.length <= max) {
    return { snippet: plain, highlights: computeHighlights(plain, query) };
  }
  const first = computeHighlights(plain, query)[0];
  const cut = windowAround(plain, first, max);
  const body = plain.slice(cut.start, cut.end).trim();
  const snippet = `${cut.lead ? ELLIPSIS : ''}${body}${cut.trail ? ELLIPSIS : ''}`;
  return { snippet, highlights: computeHighlights(snippet, query) };
}
