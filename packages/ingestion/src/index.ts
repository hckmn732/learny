// Public API of the ingestion package (SPEC-509).
export { chunkText, ChunkTextInput, excerptOf, OVERLAP_TOKENS, TARGET_TOKENS } from './chunk';
export type { SourceLocation, TextChunk } from './chunk';
export {
  defaultEmbeddingClient,
  embedTexts,
  EMBEDDING_BATCH_SIZE,
  EMBEDDING_MODEL,
  fakeEmbedding,
  mockEmbeddingClient,
  toVectorLiteral,
  voyageEmbeddingClient,
} from './embeddings';
export type { EmbeddingClient, VoyageOptions } from './embeddings';
export { extractNote } from './extract/note';
export { DEFAULT_PDF_LIMITS, extractPdf } from './extract/pdf';
export type { ExtractedContent, PdfLimits } from './extract/types';
export {
  createAnthropicPdfUploader,
  createSupabasePdfReader,
  defaultIngestionDeps,
  noopIngestionEvents,
} from './deps';
export type {
  DefaultIngestionOptions,
  IngestionClock,
  IngestionDeps,
  IngestionEvents,
  PdfReader,
  PdfUploader,
  ReadPdfInput,
  UploadPdfInput,
} from './deps';
export { INGESTION_EVENT_CLAIM_STALE_MS, processResource } from './process-resource';
export type { IngestionContext, StepRunner } from './process-resource';
export { IngestionError, isIngestionError, sourceMissing, unsupportedKind } from './errors';
export type { IngestionErrorOptions } from './errors';
