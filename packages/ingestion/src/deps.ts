// Injected ports of the ingestion pipeline (SPEC-509 ET-3, ET-4, CL-3).
//
// Everything that leaves the process (Storage, Voyage, Anthropic Files, domain events) is a port,
// so the unit and integration suites run with in-memory adapters and the demonstration never
// reaches a provider. The production defaults are built from the server environment; secrets are
// read here and never logged.
import type { LlmMode } from '@learny/config';
import { AppError, type Clock, type LearnyLogger } from '@learny/core';
import { parseOwnedPath, type Db } from '@learny/db';
import { resolveModel, uploadDocument } from '@learny/llm';

import { defaultEmbeddingClient, type EmbeddingClient } from './embeddings';
import { IngestionError } from './errors';
import type { VisionReader } from './extract/image';
import { DEFAULT_PDF_LIMITS } from './extract/pdf';
import type { PdfLimits } from './extract/types';
import { safeWebFetcher, type WebFetcher } from './extract/web';
import { defaultYoutubeProvider, type YoutubeProvider } from './extract/youtube';

export interface ReadPdfInput {
  ownerId: string;
  resourceId: string;
  storagePath: string;
  maxBytes: number;
}

/** Reads the private PDF bytes with the service role; `null` when the object is gone. */
export type PdfReader = (input: ReadPdfInput) => Promise<Uint8Array | null>;

export interface UploadPdfInput {
  db: Db;
  userId: string;
  resourceId: string;
  bytes: Uint8Array;
}

/** Sends the PDF to the Anthropic Files API when this user uses Anthropic (EF-2). */
export type PdfUploader = (input: UploadPdfInput) => Promise<string | null>;

export interface IngestionEvents {
  resourceReady(event: { userId: string; resourceId: string; chunkCount: number }): Promise<void>;
  resourceFailed(event: { userId: string; resourceId: string; errorCode: string }): Promise<void>;
}

export interface IngestionDeps {
  readPdf: PdfReader;
  /** Generic private-file reader; defaults to `readPdf` so SPEC-509 callers stay unchanged. */
  readFile?: PdfReader;
  embedder: EmbeddingClient;
  uploadPdf: PdfUploader;
  events: IngestionEvents;
  limits: PdfLimits;
  /** SPEC-510 ports; each defaults to its guarded production adapter. */
  fetchWeb?: WebFetcher;
  youtube?: YoutubeProvider;
  vision?: VisionReader;
  mode?: LlmMode;
}

type Env = Readonly<Record<string, string | undefined>>;

interface SupabaseConfig {
  url: string;
  apiKey: string;
  serviceKey: string;
}

function supabaseConfig(env: Env): SupabaseConfig | null {
  const url = env.NEXT_PUBLIC_SUPABASE_URL ?? env.SUPABASE_URL;
  const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? env.SUPABASE_ANON_KEY;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY ?? env.SUPABASE_SECRET_KEY;
  if (
    url === undefined ||
    anonKey === undefined ||
    serviceKey === undefined ||
    url === '' ||
    anonKey === '' ||
    serviceKey === ''
  ) {
    return null;
  }
  return { url: url.replace(/\/+$/, ''), apiKey: anonKey, serviceKey };
}

function encodePath(value: string): string {
  return value.split('/').map(encodeURIComponent).join('/');
}

/**
 * ET-4 — reads an apport from the private `resources` bucket with the service role. The path is
 * re-bound to the owner and to the resource identifier, so a bad row can never read another
 * learner's object. The bound is applied before and after the download.
 */
export function createSupabasePdfReader(
  env: Env = process.env,
  fetchImplementation: typeof fetch = fetch,
): PdfReader {
  return async (input) => {
    const parsed = parseOwnedPath(input.storagePath, input.ownerId);
    if (parsed === null || parsed.objectId !== input.resourceId) {
      throw new IngestionError(
        'RESOURCE_FILE_MISSING',
        'Le fichier de cet apport est introuvable. Supprimez-le ou envoyez-le de nouveau.',
      );
    }
    const config = supabaseConfig(env);
    if (config === null) {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'Le stockage des apports n’est pas configuré : réessayez dans un instant.',
      );
    }
    let response: Response;
    try {
      response = await fetchImplementation(
        `${config.url}/storage/v1/object/authenticated/resources/${encodePath(input.storagePath)}`,
        {
          headers: {
            apikey: config.apiKey,
            authorization: `Bearer ${config.serviceKey}`,
          },
        },
      );
    } catch (error) {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'Le stockage des apports est momentanément indisponible.',
        { cause: error },
      );
    }
    if (response.status === 404 || response.status === 400) return null;
    if (!response.ok) {
      throw new AppError(
        'SERVICE_UNAVAILABLE',
        'Le stockage des apports est momentanément indisponible.',
        { status: response.status },
      );
    }
    const declared = Number(response.headers.get('content-length') ?? '0');
    if (declared > input.maxBytes) {
      throw new IngestionError(
        'PDF_TOO_LARGE',
        `Ce PDF dépasse la limite de ${String(Math.floor(input.maxBytes / 1_048_576))} Mo.`,
      );
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length > input.maxBytes) {
      throw new IngestionError(
        'PDF_TOO_LARGE',
        `Ce PDF dépasse la limite de ${String(Math.floor(input.maxBytes / 1_048_576))} Mo.`,
      );
    }
    return bytes;
  };
}

/**
 * EF-2 — best-effort upload to the Anthropic Files API. Only the provided AI (`managed`) is sent:
 * a personal Anthropic key would require the decryption service of SPEC-505, which is not part of
 * the ingestion. Any upload failure leaves the extracted text usable.
 */
export function createAnthropicPdfUploader(mode: LlmMode, logger?: LearnyLogger): PdfUploader {
  return async (input) => {
    const resolved = await resolveModel(input.db, { userId: input.userId, task: 'course' });
    if (
      !resolved.ok ||
      resolved.value.provider !== 'anthropic' ||
      resolved.value.kind !== 'managed'
    ) {
      return null;
    }
    try {
      const uploaded = await uploadDocument(
        { mode },
        {
          resolved: resolved.value,
          bytes: input.bytes,
          mime: 'application/pdf',
          filename: `${input.resourceId}.pdf`,
        },
      );
      return uploaded.fileId;
    } catch {
      // The text extraction is enough to make the resource ready; never log bytes or a key.
      logger?.warn('pdf file upload skipped', {
        component: 'ingestion',
        operation: 'anthropic-files',
        outcome: 'skipped',
      });
      return null;
    }
  };
}

export const noopIngestionEvents: IngestionEvents = {
  resourceReady: () => Promise.resolve(),
  resourceFailed: () => Promise.resolve(),
};

export interface DefaultIngestionOptions {
  events?: IngestionEvents;
  mode?: LlmMode;
  env?: Env;
  limits?: PdfLimits;
  logger?: LearnyLogger;
}

/** Production ports and the deterministic mock ports selected by `LLM_MODE` (ADR-0048). */
export function defaultIngestionDeps(options: DefaultIngestionOptions = {}): IngestionDeps {
  const env = options.env ?? process.env;
  const mode: LlmMode = options.mode ?? (env.LLM_MODE === 'live' ? 'live' : 'mock');
  const readPdf = createSupabasePdfReader(env);
  return {
    readPdf,
    readFile: readPdf,
    embedder: defaultEmbeddingClient(env),
    uploadPdf: createAnthropicPdfUploader(mode, options.logger),
    events: options.events ?? noopIngestionEvents,
    limits: options.limits ?? DEFAULT_PDF_LIMITS,
    fetchWeb: safeWebFetcher(),
    youtube: defaultYoutubeProvider(mode),
    mode,
  };
}

/** Clock used by callers that do not pass one: the injected clock of `@learny/core`. */
export type IngestionClock = Clock;
