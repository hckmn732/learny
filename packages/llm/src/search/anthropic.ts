// Native Anthropic web search (SPEC-512 EF-2, ET-3; ADR-0048).
//
// In `mock` the route reads a committed fixture: no client, no key and no network call. In `live`
// the provider-side `web_search` tool runs inside a text generation and its URL sources are the
// raw answer; the caller normalizes and budgets them exactly like the Tavily fallback.
import { anthropic } from '@ai-sdk/anthropic';
import { generateText, type LanguageModel } from 'ai';

import { err, ok, type Result } from '@learny/core';

import { searchFixture } from './fixtures';
import { searchUnavailable, type SearchProviderClient, type SearchProviderRequest } from './types';

export interface AnthropicSearchOptions {
  mode: 'live' | 'mock';
  scenario?: string | undefined;
  /** Required in `live`: the resolved Anthropic model and its server-side key. */
  model?: LanguageModel | undefined;
  signal?: AbortSignal | undefined;
}

/** Prompt of the native route: the model calls its provider-side search tool. */
function searchPrompt(query: string): string {
  return [
    'Search the public web for up-to-date, reliable sources.',
    `Query: ${query}`,
    'Return only sources you actually visited; never invent a URL.',
  ].join('\n');
}

export function createAnthropicSearch(options: AnthropicSearchOptions): SearchProviderClient {
  const { mode, scenario, model, signal } = options;
  return {
    provider: 'anthropic',
    async search(request: SearchProviderRequest): Promise<Result<unknown[]>> {
      if (mode === 'mock') return searchFixture('anthropic', scenario);
      if (model === undefined) return err(searchUnavailable());
      try {
        const generated = await generateText({
          model,
          prompt: searchPrompt(request.query),
          tools: {
            web_search: anthropic.tools.webSearch_20260209({ maxUses: request.limit }),
          },
          ...(signal === undefined ? {} : { abortSignal: signal }),
        });
        const results = generated.sources
          .filter((source) => source.sourceType === 'url')
          .map((source) => ({ title: source.title, url: source.url, snippet: '' }));
        return ok(results);
      } catch (error) {
        return err(searchUnavailable(error));
      }
    },
  };
}
