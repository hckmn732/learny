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
export {
  IMAGE_PROMPT_ID,
  IMAGE_SCENARIO,
  createLlmVisionReader,
  extractImage,
  extractImageDocument,
  imageContent,
} from './extract/image';
export type {
  ImageExtractedDocument,
  ImageExtractionOptions,
  ImageResourceInput,
  VisionReader,
  VisionReading,
} from './extract/image';
export { extractNote } from './extract/note';
export { DEFAULT_PDF_LIMITS, extractPdf } from './extract/pdf';
export {
  IMAGE_LIMITS,
  RemoteUrlInput,
  WEB_LIMITS,
  YOUTUBE_LIMITS,
  remoteError,
} from './extract/remote';
export { extractWeb, extractWebDocument, safeWebFetcher } from './extract/web';
export type {
  WebExtractedDocument,
  WebExtractionOptions,
  WebFetcher,
  WebFetchResult,
} from './extract/web';
export {
  defaultYoutubeProvider,
  extractYoutube,
  liveYoutubeProvider,
  mockYoutubeProvider,
  parseYoutubeUrl,
  youtubeContent,
} from './extract/youtube';
export type { YoutubeCaptions, YoutubeExtractionOptions, YoutubeProvider } from './extract/youtube';
export type { ExtractedContent, PdfLimits, VisionOrigin } from './extract/types';
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
export {
  escapeDocumentAttribute,
  escapeDocumentText,
  formatChunkLocation,
  formatDocumentChunk,
} from './retrieval/format-document';
export {
  compareRetrievalChunks,
  deduplicateChunks,
  normalizeDocumentText,
  selectContext,
  textOverlapRatio,
} from './retrieval/select-context';
export type { DeduplicatedChunks } from './retrieval/select-context';
export { RETRIEVAL_HNSW_EF_SEARCH, searchRelevantChunks } from './retrieval/search-context';
export type { RetrievalContext } from './retrieval/search-context';
