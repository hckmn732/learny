// Common shape returned by every extractor of the ingestion (SPEC-509 EF-2, SPEC-510 reuses it).
import type { ChunkLocation } from '@learny/db/schema';

export interface ExtractedContent {
  /** Text the passages are cut from; offsets in `locations` are absolute in this text. */
  text: string;
  /** Number of pages of a PDF; `null` for a note. */
  pages: number | null;
  locations: ChunkLocation[];
}

/** PDF extractor limits, read from `@learny/config` by the caller (BR-APP-02). */
export interface PdfLimits {
  maxBytes: number;
  maxPages: number;
  noteMaxCharacters: number;
}
