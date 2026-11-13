// Common contract of a web search provider adapter (SPEC-512 ET-2, ET-3).
import { SEARCH_WEB_UNAVAILABLE_MESSAGE, type SearchWebProvider } from '@learny/contracts';
import { AppError, type Result } from '@learny/core';

export interface SearchProviderRequest {
  query: string;
  limit: number;
}

/**
 * One provider route. `search` returns the raw provider payload; normalization is applied once by
 * `runSearch`, so the native and fallback routes always produce the same schema.
 */
export interface SearchProviderClient {
  readonly provider: SearchWebProvider;
  search(request: SearchProviderRequest): Promise<Result<unknown[]>>;
}

/** EF-5 — explicit, safe unavailability: no invented source and no automatic paid fallback. */
export function searchUnavailable(cause?: unknown): AppError {
  return new AppError('SEARCH_UNAVAILABLE', SEARCH_WEB_UNAVAILABLE_MESSAGE, {
    status: 503,
    ...(cause === undefined ? {} : { cause }),
  });
}
