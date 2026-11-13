// Web search of the tutor (SPEC-512 EF-2, EF-3, EF-5; BR-IA-12, ADR-0048).
//
// One entry point builds the route, normalizes the answer once and cuts it to the programme text
// budget. The native Anthropic search is used when the resolved provider supports it; otherwise the
// configured Tavily fallback is used, and a missing key is an explicit `SEARCH_UNAVAILABLE`.
import type { LlmMode } from '@learny/config';
import {
  SEARCH_WEB_TEXT_BUDGET_TOKENS,
  type SearchWebProvider,
  type SearchWebResult,
} from '@learny/contracts';
import { err, ok, type Result } from '@learny/core';

import { searchApiKey } from '../config';
import { providerSupports } from '../providers/catalog';
import { createLanguageModel } from '../providers/factory';
import type { ResolvedModel } from '../resolve';

import { createAnthropicSearch } from './anthropic';
import { fitResultsToBudget, normalizeSearchResults } from './normalize';
import { createTavilySearch } from './tavily';
import { searchUnavailable, type SearchProviderClient, type SearchProviderRequest } from './types';

export interface CreateSearchProviderOptions {
  provider: SearchWebProvider;
  mode: LlmMode;
  /** Mock scenario; defaults to the provider's fixture. */
  scenario?: string | undefined;
  /** Tavily key, read server-side (`SEARCH_API_KEY`) when omitted. */
  apiKey?: string | null | undefined;
  /** Resolved model, required for the live native route. */
  resolved?: ResolvedModel | undefined;
  /** Personal key decrypted just before the call (SPEC-505); never logged. */
  secrets?: { apiKey?: string | null } | undefined;
  fetch?: typeof globalThis.fetch | undefined;
  signal?: AbortSignal | undefined;
}

/**
 * EF-2 — the native route is used when the resolved provider has the `web_search` capability;
 * every other provider goes through the Tavily fallback.
 */
export function searchProviderForResolved(resolved: ResolvedModel): SearchWebProvider {
  return providerSupports(resolved.provider, 'webSearch') ? 'anthropic' : 'tavily';
}

export function createProviderSearch(
  options: CreateSearchProviderOptions,
): Result<SearchProviderClient> {
  if (options.provider === 'anthropic') {
    if (options.mode === 'mock') {
      return ok(createAnthropicSearch({ mode: 'mock', scenario: options.scenario }));
    }
    if (options.resolved === undefined) return err(searchUnavailable());
    try {
      const model = createLanguageModel(options.resolved, {
        apiKey: options.secrets?.apiKey ?? null,
      });
      return ok(
        createAnthropicSearch({
          mode: 'live',
          model,
          ...(options.signal === undefined ? {} : { signal: options.signal }),
        }),
      );
    } catch (error) {
      return err(searchUnavailable(error));
    }
  }

  // CL-2 — Tavily is unavailable without its server-side key, even in mock mode.
  const apiKey = options.apiKey ?? searchApiKey();
  if (apiKey === null || apiKey.trim() === '') return err(searchUnavailable());
  return ok(
    createTavilySearch({
      mode: options.mode,
      apiKey,
      ...(options.scenario === undefined ? {} : { scenario: options.scenario }),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    }),
  );
}

export interface RunSearchOptions {
  /** Test seam; production uses the programme budget of docs/architecture/ai.md §3. */
  budgetTokens?: number | undefined;
}

export interface RunSearchResult {
  results: SearchWebResult[];
  limited: boolean;
}

/** ET-2, ET-3 — one normalization and one budget pass for both provider routes. */
export async function runSearch(
  client: SearchProviderClient,
  request: SearchProviderRequest,
  options: RunSearchOptions = {},
): Promise<Result<RunSearchResult>> {
  const raw = await client.search(request);
  if (!raw.ok) return raw;
  const normalized = normalizeSearchResults(raw.value, client.provider);
  return ok(fitResultsToBudget(normalized, options.budgetTokens ?? SEARCH_WEB_TEXT_BUDGET_TOKENS));
}

export {
  canonicalizeUrl,
  fitResultsToBudget,
  isPublicHttpUrl,
  normalizeSearchResults,
  plainText,
} from './normalize';
export { createAnthropicSearch } from './anthropic';
export { createTavilySearch, TAVILY_ENDPOINT } from './tavily';
export {
  DEFAULT_SEARCH_SCENARIO,
  SEARCH_FIXTURES,
  SEARCH_FIXTURE_SCHEMA,
  searchFixture,
} from './fixtures';
export { searchUnavailable } from './types';
export type { SearchProviderClient, SearchProviderRequest } from './types';
