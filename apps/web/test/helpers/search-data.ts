import {
  SEARCH_MAX_LIMIT,
  SEARCH_QUERY_MAX_LENGTH,
  SEARCH_QUERY_MIN_LENGTH,
  SEARCH_TOO_LONG_MESSAGE,
  normalizeSearchText,
} from '@learny/contracts';
import type { ServiceContext } from '@learny/services';
import { searchUserContent } from '@learny/services';

import { searchTotal, type SearchPageState } from '../../lib/search-data';

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
