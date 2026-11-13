// `search_web` action of the tutor (SPEC-512 EF-1, EF-3, EF-5, ET-1; BR-IA-12, ADR-0048).
//
// The guard runs before anything else: only the `programme` task may search, for programme design
// or a resource suggestion. The result is normalized and budgeted by `@learny/llm`; this module
// never writes a course, a citation or a resource — the learner must import a suggestion.
import {
  SEARCH_WEB_EMPTY_MESSAGE,
  SEARCH_WEB_PURPOSES,
  SEARCH_WEB_TOOL_NOT_ALLOWED_MESSAGE,
  SearchWebOutput,
  SearchWebQuery,
  type SearchWebProvider,
} from '@learny/contracts';
import { AppError, err, ok, type Clock, type LearnyLogger, type Result } from '@learny/core';
import type { Db } from '@learny/db';
import {
  createProviderSearch,
  llmMode,
  resolveModel,
  runSearch,
  searchProviderForResolved,
  searchUnavailable,
  type ResolvedModel,
  type SearchProviderClient,
} from '@learny/llm';

import { WEB_SEARCH_TASKS, type TutorTask } from '../tasks';

import type { TutorTool } from './tool';

export const SEARCH_WEB_TOOL_NAME = 'search_web';

export interface SearchWebSecrets {
  /** Tavily key, server-side only; never logged. */
  searchApiKey?: string | null | undefined;
  /** Personal Anthropic key decrypted by SPEC-505 just before the call. */
  apiKey?: string | null | undefined;
}

/** Context of a tutor action (SPEC-508 completes it with the loop context). */
export interface SearchWebContext {
  task: TutorTask;
  userId: string;
  /** RLS client of the user, used only to resolve the programme model. */
  db?: Db;
  clock?: Clock;
  logger?: LearnyLogger;
  /** Test seam: a ready provider client; production leaves it undefined. */
  provider?: SearchProviderClient;
  /**
   * Explicit route of the demonstration and the tests. Production derives the route from the
   * resolved model (`searchProviderForResolved`).
   */
  providerName?: SearchWebProvider;
  /** Simulated scenario of the selected provider. */
  scenario?: string;
  mode?: 'live' | 'mock';
  secrets?: SearchWebSecrets;
  /** Test seam for the live Tavily HTTP call. */
  fetch?: typeof globalThis.fetch;
  signal?: AbortSignal;
}

function validationFailed(error: {
  issues: readonly { path: readonly PropertyKey[]; message: string }[];
}): AppError {
  return new AppError('VALIDATION_FAILED', 'Les données envoyées sont invalides.', {
    status: 400,
    errors: error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  });
}

/** ET-1 — pure authorization. It is the first statement of `execute` and never calls a provider. */
export function guardSearchWeb(
  ctx: Pick<SearchWebContext, 'task'>,
  input: SearchWebQuery,
): AppError | null {
  if (!WEB_SEARCH_TASKS.includes(ctx.task)) {
    return new AppError('TOOL_NOT_ALLOWED', SEARCH_WEB_TOOL_NOT_ALLOWED_MESSAGE, {
      status: 403,
      reason: ctx.task,
    });
  }
  // ET-1 — the purpose is part of the authorization, not only of the schema: a caller that reached
  // the guard with an unknown purpose is refused before any provider is built.
  if (!(SEARCH_WEB_PURPOSES as readonly string[]).includes(input.purpose)) {
    return new AppError('TOOL_NOT_ALLOWED', SEARCH_WEB_TOOL_NOT_ALLOWED_MESSAGE, { status: 403 });
  }
  return null;
}

async function clientFor(ctx: SearchWebContext): Promise<Result<SearchProviderClient>> {
  if (ctx.provider !== undefined) return ok(ctx.provider);
  const mode = ctx.mode ?? llmMode();

  let resolved: ResolvedModel | undefined;
  let providerName = ctx.providerName;
  if (ctx.db !== undefined) {
    const resolvedResult = await resolveModel(ctx.db, { userId: ctx.userId, task: 'programme' });
    if (!resolvedResult.ok) return resolvedResult;
    resolved = resolvedResult.value;
    providerName ??= searchProviderForResolved(resolvedResult.value);
  }
  if (providerName === undefined) return err(searchUnavailable());

  return createProviderSearch({
    provider: providerName,
    mode,
    ...(ctx.scenario === undefined ? {} : { scenario: ctx.scenario }),
    ...(ctx.secrets?.searchApiKey === undefined ? {} : { apiKey: ctx.secrets.searchApiKey }),
    ...(resolved === undefined ? {} : { resolved }),
    ...(ctx.secrets?.apiKey === undefined ? {} : { secrets: { apiKey: ctx.secrets.apiKey } }),
    ...(ctx.fetch === undefined ? {} : { fetch: ctx.fetch }),
    ...(ctx.signal === undefined ? {} : { signal: ctx.signal }),
  });
}

function output(
  input: SearchWebQuery,
  provider: SearchWebProvider,
  result: { results: SearchWebOutput['results']; limited: boolean },
): Result<SearchWebOutput> {
  const validated = SearchWebOutput.safeParse({
    query: input.query,
    purpose: input.purpose,
    provider,
    results: result.results,
    limited: result.limited,
    message: result.results.length === 0 ? SEARCH_WEB_EMPTY_MESSAGE : null,
  } satisfies SearchWebOutput);
  if (!validated.success) {
    return err(
      new AppError('INVALID_RESPONSE', 'La recherche web a produit une réponse non conforme.', {
        status: 502,
      }),
    );
  }
  return ok(validated.data);
}

/**
 * ET-1, ET-2, ET-3, EF-5 — the action entry point. The query is validated, the task is checked, and
 * only then is the provider built and called. Failures are returned as typed errors; no source is
 * ever invented and no paid provider is switched to automatically.
 */
export async function searchWeb(
  ctx: SearchWebContext,
  rawInput: unknown,
): Promise<Result<SearchWebOutput>> {
  const parsed = SearchWebQuery.safeParse(rawInput);
  if (!parsed.success) return err(validationFailed(parsed.error));
  const refusal = guardSearchWeb(ctx, parsed.data);
  if (refusal !== null) return err(refusal);

  const client = await clientFor(ctx);
  if (!client.ok) return client;
  const result = await runSearch(client.value, {
    query: parsed.data.query,
    limit: parsed.data.limit,
  });
  if (!result.ok) {
    ctx.logger?.warn('web search unavailable', {
      operation: 'search_web',
      outcome: 'unavailable',
      code: result.error.code,
    });
    return result;
  }

  // ET-4 — only the length of the query and the number of results are logged, never its text,
  // an URL or a key.
  ctx.logger?.info('web search completed', {
    operation: 'search_web',
    outcome: result.value.limited ? 'limited' : 'ok',
    queryLength: Array.from(parsed.data.query).length,
    resultCount: result.value.results.length,
  });
  return output(parsed.data, client.value.provider, result.value);
}

export const searchWebTool: TutorTool<SearchWebContext, SearchWebQuery, SearchWebOutput> = {
  name: SEARCH_WEB_TOOL_NAME,
  description:
    'Recherche des pages web publiques pour concevoir un programme ou suggérer une ressource à un chapitre. Ne jamais recopier un résultat dans un cours : une ressource n’entre dans le chapitre que si l’apprenant l’importe.',
  inputSchema: SearchWebQuery,
  outputSchema: SearchWebOutput,
  guard: guardSearchWeb,
  execute: searchWeb,
};
