// Paragraph-aware splitting of an extracted contribution (SPEC-509 ET-2, EF-3, CA-1).
//
// The function is pure and deterministic: the same text and locations always produce the same
// passages. A passage never crosses a source location (page for a PDF), always ends on a
// paragraph boundary when possible, keeps an exact `{charStart, charEnd}` range (so
// `text.slice(charStart, charEnd)` is exactly the passage) and repeats the last ~100 tokens of
// the previous passage as overlap.
import { z } from 'zod';

import type { ChunkLocation } from '@learny/db/schema';
import { estimateTokens } from '@learny/llm';

import { IngestionError } from './errors';

/** ET-2 defaults: about 800 tokens per passage, 100 tokens of overlap. */
export const TARGET_TOKENS = 800;
export const OVERLAP_TOKENS = 100;
/** Characters per token used by the shared estimate (docs/architecture/ai.md §6). */
const CHARACTERS_PER_TOKEN = 4;
const MAX_LOCATION_CHAR_END = 2_000_000;

export const ChunkTextInput = z.strictObject({
  text: z.string().min(1).max(MAX_LOCATION_CHAR_END),
  locations: z
    .array(
      z
        .strictObject({
          page: z.number().int().min(1).optional(),
          anchor: z.string().max(200).optional(),
          startSec: z.number().min(0).optional(),
          endSec: z.number().min(0).optional(),
          charStart: z.number().int().min(0),
          charEnd: z.number().int().min(0),
        })
        .refine((location) => location.charEnd > location.charStart, {
          message: 'charEnd doit être supérieur à charStart',
          path: ['charEnd'],
        }),
    )
    .min(1)
    .max(1000)
    .optional(),
  targetTokens: z.number().int().min(20).max(4000).default(TARGET_TOKENS),
  overlapTokens: z.number().int().min(0).max(3999).default(OVERLAP_TOKENS),
});

export type ChunkTextInput = z.input<typeof ChunkTextInput>;
export type SourceLocation = NonNullable<z.infer<typeof ChunkTextInput>['locations']>[number];

export interface TextChunk {
  position: number;
  text: string;
  location: ChunkLocation;
  tokenCount: number;
}

interface Unit {
  start: number;
  end: number;
  tokens: number;
}

function validation(detail: string): IngestionError {
  return new IngestionError('TEXT_EMPTY', detail);
}

/** Adjusts a range to remove surrounding whitespace while keeping exact offsets. */
function trimRange(
  text: string,
  start: number,
  end: number,
): { start: number; end: number } | null {
  let left = start;
  let right = end;
  while (left < right && /\s/.test(text[left] ?? '')) left += 1;
  while (right > left && /\s/.test(text[right - 1] ?? '')) right -= 1;
  return right > left ? { start: left, end: right } : null;
}

/**
 * Splits a paragraph larger than the target at the last sentence or word boundary that fits.
 * The returned ranges are exact sub-ranges of the paragraph.
 */
function splitLongRange(text: string, start: number, end: number, maxChars: number): Unit[] {
  const units: Unit[] = [];
  let cursor = start;
  while (cursor < end) {
    let candidate = Math.min(cursor + maxChars, end);
    if (candidate < end) {
      const window = text.slice(cursor, candidate);
      const sentence = Math.max(
        window.lastIndexOf('. '),
        window.lastIndexOf('! '),
        window.lastIndexOf('? '),
      );
      const word = window.lastIndexOf(' ');
      const cut =
        sentence >= maxChars / 2 ? sentence + 1 : word >= maxChars / 2 ? word : window.length;
      candidate = cursor + cut;
    }
    const trimmed = trimRange(text, cursor, candidate);
    if (trimmed !== null) {
      units.push({ ...trimmed, tokens: estimateTokens(text.slice(trimmed.start, trimmed.end)) });
    }
    cursor = candidate > cursor ? candidate : cursor + 1;
  }
  return units;
}

/** Paragraph units of one source location, largest ones split to fit the token target. */
function unitsOfLocation(text: string, location: SourceLocation, maxChars: number): Unit[] {
  const units: Unit[] = [];
  const source = text.slice(location.charStart, location.charEnd);
  if (source.trim() === '') return units;
  const separator = /\r?\n+/g;
  let paragraphStart = 0;
  let match: RegExpExecArray | null;
  const addParagraph = (from: number, to: number): void => {
    const trimmed = trimRange(text, location.charStart + from, location.charStart + to);
    if (trimmed === null) return;
    const entry = { ...trimmed, tokens: estimateTokens(text.slice(trimmed.start, trimmed.end)) };
    if (entry.tokens <= Math.floor(maxChars / CHARACTERS_PER_TOKEN)) {
      units.push(entry);
      return;
    }
    units.push(...splitLongRange(text, trimmed.start, trimmed.end, maxChars));
  };
  while ((match = separator.exec(source)) !== null) {
    addParagraph(paragraphStart, match.index);
    paragraphStart = match.index + match[0].length;
  }
  addParagraph(paragraphStart, source.length);
  return units;
}

function locationFor(origin: SourceLocation, start: number, end: number): ChunkLocation {
  const location: Record<string, number | string> = { charStart: start, charEnd: end };
  if (origin.page !== undefined) location.page = origin.page;
  if (origin.anchor !== undefined) location.anchor = origin.anchor;
  if (origin.startSec !== undefined) location.startSec = origin.startSec;
  if (origin.endSec !== undefined) location.endSec = origin.endSec;
  return location as ChunkLocation;
}

/**
 * ET-2 — splits `text` into ~`targetTokens` passages on paragraph boundaries, with
 * `overlapTokens` of overlap. The input locations (page, anchor, timestamps) are preserved and
 * passage offsets stay absolute in `text`.
 */
export function chunkText(input: ChunkTextInput): TextChunk[] {
  const parsed = ChunkTextInput.safeParse(input);
  if (!parsed.success) {
    throw validation(parsed.error.issues[0]?.message ?? 'Entrée de découpage invalide.');
  }
  const { text, targetTokens, overlapTokens } = parsed.data;
  if (overlapTokens >= targetTokens) {
    throw validation('Le chevauchement doit être inférieur à la taille cible.');
  }
  const locations: SourceLocation[] = parsed.data.locations ?? [
    { charStart: 0, charEnd: text.length },
  ];
  for (const location of locations) {
    if (location.charEnd > text.length) {
      throw validation('Un emplacement dépasse la longueur du texte.');
    }
  }

  const chunks: TextChunk[] = [];
  const maxChars = targetTokens * CHARACTERS_PER_TOKEN;
  for (const location of locations) {
    const units = unitsOfLocation(text, location, maxChars);
    let start = 0;
    while (start < units.length) {
      let end = start;
      let tokens = 0;
      while (end < units.length) {
        const unit = units[end];
        if (unit === undefined) break;
        if (end > start && tokens + unit.tokens > targetTokens) break;
        tokens += unit.tokens;
        end += 1;
      }
      if (end === start) end = start + 1;
      const first = units[start];
      const last = units[end - 1];
      if (first === undefined || last === undefined) break;
      const chunkTextValue = text.slice(first.start, last.end);
      chunks.push({
        position: chunks.length,
        text: chunkTextValue,
        location: locationFor(location, first.start, last.end),
        tokenCount: estimateTokens(chunkTextValue),
      });
      if (end >= units.length) break;

      // Overlap: reuse trailing units of the passage, but never the whole passage. When no
      // paragraph fits under the token budget, the last one still overlaps (about 100 tokens).
      let overlapStart = end;
      let overlap = 0;
      while (overlapStart > start) {
        const candidate = units[overlapStart - 1];
        if (candidate === undefined) break;
        if (overlap + candidate.tokens >= tokens) break;
        if (overlap > 0 && overlap + candidate.tokens > overlapTokens) break;
        overlap += candidate.tokens;
        overlapStart -= 1;
      }
      start = overlapStart < end ? overlapStart : end;
    }
  }

  if (chunks.length === 0) throw validation('Le texte ne contient aucun passage exploitable.');
  return chunks;
}

/** Deterministic excerpt of a passage, used by citations and the demonstration (BR-APP-06). */
export function excerptOf(
  text: string,
  location: Pick<ChunkLocation, 'charStart' | 'charEnd'>,
): string {
  return text.slice(location.charStart, location.charEnd);
}
