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
import type { ServiceContext } from '@learny/services';
import { searchUserContent } from '@learny/services';

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
export async function searchPageForContext(
  ctx: ServiceContext,
  rawQuery: string,
): Promise<SearchPageState> {
  const query = normalizeSearchText(rawQuery);
  const length = Array.from(query).length;
  if (length < SEARCH_QUERY_MIN_LENGTH) return { status: 'short', query };
  if (length > SEARCH_QUERY_MAX_LENGTH) {
    return { status: 'error', query, message: SEARCH_TOO_LONG_MESSAGE };
  }

  const result = await searchUserContent(ctx, { q: query, limit: SEARCH_MAX_LIMIT });
  if (!result.ok) {
    return result.error.requestId === undefined
      ? { status: 'error', query }
      : { status: 'error', query, requestId: result.error.requestId };
  }
  return {
    status: 'done',
    query: result.value.query,
    response: result.value,
    total: searchTotal(result.value),
  };
}
