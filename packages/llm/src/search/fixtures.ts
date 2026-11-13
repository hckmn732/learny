// Versioned fixtures of the simulated web search (SPEC-512 ET-3, ET-5; ADR-0048).
//
// They mirror the two provider routes: the native Anthropic server search and the Tavily fallback.
// Selection is explicit (`scenario`) and deterministic; the default scenario of a provider is the
// one used by the demonstration. No fixture ever contains a real key or private content.
import { z } from 'zod';

import {
  SEARCH_WEB_UNAVAILABLE_MESSAGE,
  SearchWebProvider,
  type SearchWebProvider as SearchWebProviderName,
} from '@learny/contracts';
import { AppError, err, ok, type Result } from '@learny/core';

import anthropicEmpty from '../../fixtures/search/anthropic/empty.json';
import anthropicNative from '../../fixtures/search/anthropic/native.json';
import tavilyFallback from '../../fixtures/search/tavily/fallback.json';
import tavilyUnavailable from '../../fixtures/search/tavily/unavailable.json';
import tavilyUnsafe from '../../fixtures/search/tavily/unsafe.json';

export const SEARCH_FIXTURE_SCHEMA = z
  .strictObject({
    provider: SearchWebProvider,
    scenario: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    description: z.string().min(1),
    results: z.array(z.unknown()).optional(),
    error: z.string().min(1).optional(),
  })
  .refine((fixture) => fixture.results !== undefined || fixture.error !== undefined, {
    message: 'Une fixture de recherche porte des résultats ou une erreur.',
  });

export interface SearchFixture {
  provider: SearchWebProviderName;
  scenario: string;
  description: string;
  results?: unknown[] | undefined;
  error?: string | undefined;
}

/** JSON imports are widened to `string`; the schema restores the literal types at load time. */
function fixture(value: unknown): SearchFixture {
  return SEARCH_FIXTURE_SCHEMA.parse(value);
}

export const SEARCH_FIXTURES: readonly SearchFixture[] = [
  fixture(anthropicNative),
  fixture(anthropicEmpty),
  fixture(tavilyFallback),
  fixture(tavilyUnsafe),
  fixture(tavilyUnavailable),
];

/** Default scenario of each provider, used when the caller does not name one. */
export const DEFAULT_SEARCH_SCENARIO: Record<SearchWebProviderName, string> = {
  anthropic: 'native',
  tavily: 'fallback',
};

export function searchFixture(
  provider: SearchWebProviderName,
  scenario: string = DEFAULT_SEARCH_SCENARIO[provider],
): Result<unknown[]> {
  const candidate = SEARCH_FIXTURES.find(
    (entry) => entry.provider === provider && entry.scenario === scenario,
  );
  if (candidate === undefined || candidate.error !== undefined) {
    return err(new AppError('SEARCH_UNAVAILABLE', SEARCH_WEB_UNAVAILABLE_MESSAGE, { status: 503 }));
  }
  return ok(candidate.results ?? []);
}
