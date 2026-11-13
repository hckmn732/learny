// Common shape returned by every extractor of the ingestion (SPEC-509 EF-2, SPEC-510 reuses it).
import type { ChunkLocation, ResourceMetadata } from '@learny/db/schema';

export interface VisionOrigin {
  task: 'light';
  provider: string;
  modelId: string;
}

export interface ExtractedContent {
  /** Text the passages are cut from; offsets in `locations` are absolute in this text. */
  text: string;
  /** Number of pages of a PDF; `null` for a note or a remote source. */
  pages: number | null;
  locations: ChunkLocation[];
  /** Title extracted from the source, written on the resource when it is more specific. */
  title?: string;
  /** Web/YouTube/image metadata (site name, language, video identifier, model origin). */
  metadata?: Partial<ResourceMetadata>;
  /** SPEC-510 EF-3 — `model` marks a reading produced by the light AI task. */
  contentOrigin?: 'source' | 'model';
  vision?: VisionOrigin;
}

/** PDF extractor limits, read from `@learny/config` by the caller (BR-APP-02). */
export interface PdfLimits {
  maxBytes: number;
  maxPages: number;
  noteMaxCharacters: number;
}
