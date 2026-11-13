// Tavily fallback of the web search (SPEC-512 EF-2, CL-2, ET-3; ADR-0048).
//
// In `mock` the route reads a committed fixture: no network. In `live` the key travels in the
// `Authorization` header only, never in the body, a URL or a log line. A failure is an explicit
// `SEARCH_UNAVAILABLE`; there is no automatic switch to a paid provider.
import { z } from 'zod';

import { err, ok, type Result } from '@learny/core';

import { searchFixture } from './fixtures';
import { searchUnavailable, type SearchProviderClient, type SearchProviderRequest } from './types';

export const TAVILY_ENDPOINT = 'https://api.tavily.com/search';

const TavilyResponse = z.object({
  results: z.array(
    z.object({
      title: z.string().optional(),
      url: z.string(),
      content: z.string().optional(),
      published_date: z.string().optional(),
    }),
  ),
});

export interface TavilySearchOptions {
  mode: 'live' | 'mock';
  /** Server-side key; never logged and never rendered. */
  apiKey: string | null;
  scenario?: string | undefined;
  fetch?: typeof globalThis.fetch | undefined;
  signal?: AbortSignal | undefined;
}

export function createTavilySearch(options: TavilySearchOptions): SearchProviderClient {
  const { mode, apiKey, scenario, signal } = options;
  const fetchImpl = options.fetch ?? globalThis.fetch;
  return {
    provider: 'tavily',
    async search(request: SearchProviderRequest): Promise<Result<unknown[]>> {
      if (apiKey === null || apiKey.trim() === '') {
        // CL-2 — no key: the route is unavailable, the caller never falls back silently.
        return err(searchUnavailable());
      }
      if (mode === 'mock') return searchFixture('tavily', scenario);
      try {
        const response = await fetchImpl(TAVILY_ENDPOINT, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            query: request.query,
            max_results: request.limit,
            search_depth: 'basic',
            include_answer: false,
            include_raw_content: false,
          }),
          ...(signal === undefined ? {} : { signal }),
        });
        if (!response.ok) return err(searchUnavailable());
        const parsed = TavilyResponse.safeParse(await response.json());
        if (!parsed.success) return err(searchUnavailable());
        return ok(parsed.data.results);
      } catch (error) {
        return err(searchUnavailable(error));
      }
    },
  };
}
