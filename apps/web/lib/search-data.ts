// Server-side data of the search page (SPEC-307 EF-3, ET-4; BR-NAV-05).
//
// The query is normalized and bounded before the service is called: fewer than two characters
// never reaches the API (CL-1), a query longer than the contract bound returns a safe error. The
// service runs under the learner's session and Row Level Security, exactly like the header field.
import {
  normalizeSearchText,
  SEARCH_MAX_LIMIT,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_MIN_LENGTH,
  SEARCH_TOO_LONG_MESSAGE,
  type SearchResponse,
} from '@learny/contracts';

import { apiErrorRequestId, isApiError, serverApi } from './api/server-client';

/** Total of every group, before the per-kind cut of the service (EF-3). */
export function searchTotal(response: SearchResponse): number {
  return response.groups.reduce((sum, group) => sum + group.total, 0);
}

export type SearchPageState =
  | { status: 'short'; query: string }
  | { status: 'done'; query: string; response: SearchResponse; total: number }
  | {
      status: 'error';
      query: string;
      /** Contract message of an invalid bound, absent for a service failure. */
      message?: string;
      requestId?: string;
    };

/**
 * Page state of `/recherche?q=` for one service context. Shared by the server component and the
 * integration test, so the page and the direct URL search run the exact same code (ET-3).
 */
export async function searchPageForApi(rawQuery: string): Promise<SearchPageState> {
  const query = normalizeSearchText(rawQuery);
  const length = Array.from(query).length;
  if (length < SEARCH_QUERY_MIN_LENGTH) return { status: 'short', query };
  if (length > SEARCH_QUERY_MAX_LENGTH) {
    return { status: 'error', query, message: SEARCH_TOO_LONG_MESSAGE };
  }

  try {
    const client = await serverApi();
    const response = await client.api.searchGlobal({
      query: { q: query, limit: SEARCH_MAX_LIMIT },
    });
    return {
      status: 'done',
      query: response.query,
      response,
      total: searchTotal(response),
    };
  } catch (error) {
    if (isApiError(error, 'UNAUTHENTICATED')) throw error;
    const requestId = apiErrorRequestId(error);
    return requestId === undefined
      ? { status: 'error', query }
      : { status: 'error', query, requestId };
  }
}
