// Shared limits, inputs and error mapping of the remote extractors (SPEC-510 ET-1 to ET-5).
//
// The network guard lives in `@learny/core/net` and this module only translates its typed errors
// into the ingestion contract. A page or a video detail is never copied into a log or an error
// message: every message below is written for the learner.
import { z } from 'zod';

import type { IngestionErrorCode } from '@learny/contracts';
import { AppError, isAppError } from '@learny/core';

import { IngestionError } from '../errors';

/** ADR-0057 — page retrieval bounds, applied by safeFetch before and during the body read. */
export const WEB_LIMITS = {
  timeoutMs: 15_000,
  maxBytes: 5 * 1_048_576,
  maxRedirects: 5,
} as const;

/** BR-APP-02 — an image is read at most at 10 MB; captions are bounded to keep the job honest. */
export const IMAGE_LIMITS = {
  maxBytes: 10_485_760,
} as const;

export const YOUTUBE_LIMITS = {
  maxSegments: 5_000,
  maxDurationSec: 12 * 60 * 60,
} as const;

/** ET-4 — the URL is validated by Zod before the guard and before any retrieval. */
export const RemoteUrlInput = z.strictObject({
  url: z.url({ protocol: /^https?$/ }).max(2048),
});
export type RemoteUrlInput = z.infer<typeof RemoteUrlInput>;

const PERMANENT_CODES = new Set<string>([
  'URL_INVALID',
  'URL_BLOCKED_HOST',
  'FETCH_TIMEOUT',
  'FETCH_TOO_LARGE',
  'FETCH_HTTP_ERROR',
  'FETCH_TOO_MANY_REDIRECTS',
  'WEB_ROBOTS_DISALLOWED',
  'ROBOTS_DISALLOWED',
  'WEB_EMPTY_TEXT',
  'WEB_UNSUPPORTED_CONTENT',
  'WEB_TOO_LARGE',
  'YOUTUBE_INVALID_URL',
  'YOUTUBE_NO_CAPTIONS',
  'IMAGE_TOO_LARGE',
  'IMAGE_UNREADABLE',
  'IMAGE_EMPTY_TEXT',
  'IMAGE_VISION_UNAVAILABLE',
]);

/**
 * Maps a network/guard error to the stable ingestion code. `WEB_ROBOTS_DISALLOWED` becomes the
 * `ROBOTS_DISALLOWED` written on the resource (SPEC-510 CL-2), everything else keeps its code.
 */
export function remoteError(error: unknown, fallback: IngestionErrorCode): IngestionError {
  if (error instanceof IngestionError) return error;
  if (isAppError(error) || error instanceof AppError) {
    const code = error.code === 'WEB_ROBOTS_DISALLOWED' ? 'ROBOTS_DISALLOWED' : error.code;
    if (code === fallback || PERMANENT_CODES.has(code)) {
      return new IngestionError(code as IngestionErrorCode, safeDetail(error), {
        permanent: PERMANENT_CODES.has(code),
        ...(error.status === undefined ? {} : { status: error.status }),
        cause: error,
      });
    }
    return new IngestionError(fallback, safeDetail(error), {
      permanent: false,
      ...(error.status === undefined ? {} : { status: error.status }),
      cause: error,
    });
  }
  return new IngestionError(fallback, 'La source n’a pas pu être lue.', {
    permanent: false,
    cause: error,
  });
}

function safeDetail(error: AppError): string {
  const detail = error.detail.replace(/\s+/g, ' ').trim();
  return detail === '' ? 'La source n’a pas pu être lue.' : detail.slice(0, 500);
}
