// References of a payload, grouped by resolver method (ET-5). Each entry keeps the exact JSON path
// so NOTION_NOT_FOUND, SOURCE_NOT_FOUND and BRICK_REF_NOT_FOUND point at the offending field.
import type { SourceRef } from './common';

export interface BrickRef {
  id: string;
  path: string;
}

export interface BrickRefs {
  notions: BrickRef[];
  chunks: BrickRef[];
  resources: BrickRef[];
  bricks: BrickRef[];
}

export function emptyRefs(): BrickRefs {
  return { notions: [], chunks: [], resources: [], bricks: [] };
}

export function withSources(refs: BrickRefs, sources: readonly SourceRef[]): BrickRefs {
  sources.forEach((source, index) => {
    refs.chunks.push({ id: source.chunkId, path: `payload.sources.${String(index)}.chunkId` });
  });
  return refs;
}
