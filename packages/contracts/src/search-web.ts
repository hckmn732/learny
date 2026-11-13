import { z } from 'zod';

import { IsoDateTime, Uuid } from './common';

// Contracts of the web search tool (SPEC-512 ET-1, ET-4; BR-IA-12, BR-APP-05, ADR-0048).
//
// The tool is reserved to the `programme` task and to two purposes: designing the programme and
// suggesting resources. A result is always a plain `{title,url,snippet,publishedAt?,provider}`
// object, whatever the provider (native Anthropic search or the Tavily fallback). Search output is
// never a course fragment: the only way a web page enters a chapter is an explicit learner import
// of a suggestion (BR-APP-05).

export const SEARCH_WEB_PROVIDERS = ['anthropic', 'tavily'] as const;
export const SearchWebProvider = z.enum(SEARCH_WEB_PROVIDERS);
export type SearchWebProvider = z.infer<typeof SearchWebProvider>;

export const SEARCH_WEB_PURPOSES = ['programme', 'resource_suggestion'] as const;
export const SearchWebPurpose = z.enum(SEARCH_WEB_PURPOSES);
export type SearchWebPurpose = z.infer<typeof SearchWebPurpose>;

/** EF-3 — bounds applied before any provider request. */
export const SEARCH_WEB_QUERY_MIN_LENGTH = 2;
export const SEARCH_WEB_QUERY_MAX_LENGTH = 300;
export const SEARCH_WEB_DEFAULT_LIMIT = 5;
export const SEARCH_WEB_MAX_LIMIT = 10;
export const SEARCH_WEB_TITLE_MAX_LENGTH = 200;
export const SEARCH_WEB_SNIPPET_MAX_LENGTH = 400;
/**
 * ET-3 / docs/architecture/ai.md §3 — the text handed to the model stays inside the programme
 * task budget (6k tokens for the read context); the search output is cut to this budget.
 */
export const SEARCH_WEB_TEXT_BUDGET_TOKENS = 6_000;

export const SEARCH_WEB_EMPTY_MESSAGE =
  'Aucun résultat trouvé. Aucune source n’est inventée : continuez sans résultat web.';
export const SEARCH_WEB_UNAVAILABLE_MESSAGE =
  'La recherche web est momentanément indisponible. Réessayez plus tard ou continuez sans source web.';
export const SEARCH_WEB_TOOL_NOT_ALLOWED_MESSAGE =
  'La recherche web ne sert qu’à concevoir le programme et à suggérer des ressources.';

/** ET-1 — input of `searchWeb(ctx, {query,purpose,limit})`. */
export const SearchWebQuery = z
  .strictObject({
    query: z
      .string()
      .trim()
      .min(SEARCH_WEB_QUERY_MIN_LENGTH, {
        message: `La recherche doit contenir au moins ${String(SEARCH_WEB_QUERY_MIN_LENGTH)} caractères.`,
      })
      .max(SEARCH_WEB_QUERY_MAX_LENGTH, {
        message: `La recherche est limitée à ${String(SEARCH_WEB_QUERY_MAX_LENGTH)} caractères.`,
      }),
    purpose: SearchWebPurpose,
    limit: z.coerce
      .number()
      .int()
      .min(1, {
        message: `La limite doit être comprise entre 1 et ${String(SEARCH_WEB_MAX_LIMIT)}.`,
      })
      .max(SEARCH_WEB_MAX_LIMIT, {
        message: `La limite doit être comprise entre 1 et ${String(SEARCH_WEB_MAX_LIMIT)}.`,
      })
      .default(SEARCH_WEB_DEFAULT_LIMIT),
  })
  .describe('Recherche web du tuteur : requête, usage et nombre de résultats.');
export type SearchWebQuery = z.infer<typeof SearchWebQuery>;

/**
 * EF-3, ET-2 — public HTTP(S) URL of a result. The private and non-HTTP cases are rejected by
 * `normalizeSearchResults`; this schema is the shape kept after normalization.
 */
export const SearchWebUrl = z
  .url({ protocol: /^https?$/ })
  .max(2048)
  .describe('URL HTTP(S) publique d’un résultat de recherche.');

/** ET-2 — normalized result; `provider` is the provenance kept for the interface and the model. */
export const SearchWebResult = z
  .strictObject({
    title: z.string().min(1).max(SEARCH_WEB_TITLE_MAX_LENGTH),
    url: SearchWebUrl,
    snippet: z.string().max(SEARCH_WEB_SNIPPET_MAX_LENGTH),
    publishedAt: IsoDateTime.optional(),
    provider: SearchWebProvider,
  })
  .describe('Résultat de recherche normalisé, avec sa provenance.');
export type SearchWebResult = z.infer<typeof SearchWebResult>;

/** ET-2, EF-5 — output of the tool; `results: []` is an honest empty answer, never an invention. */
export const SearchWebOutput = z
  .strictObject({
    query: z.string(),
    purpose: SearchWebPurpose,
    provider: SearchWebProvider,
    results: z.array(SearchWebResult),
    /** True when the task text budget cut the provider answer. */
    limited: z.boolean(),
    /** Honest message shown when there is no result, null otherwise. */
    message: z.string().nullable(),
  })
  .describe('Résultat validé de la recherche web.');
export type SearchWebOutput = z.infer<typeof SearchWebOutput>;

/** BR-APP-05 — a tutor suggestion is a pending resource the learner imports or dismisses. */
export const RESOURCE_SUGGESTION_STATUSES = ['pending', 'imported', 'dismissed'] as const;
export const ResourceSuggestionStatus = z.enum(RESOURCE_SUGGESTION_STATUSES);
export type ResourceSuggestionStatus = z.infer<typeof ResourceSuggestionStatus>;

export const ResourceSuggestionDecision = z.enum(['import', 'dismiss']);
export type ResourceSuggestionDecision = z.infer<typeof ResourceSuggestionDecision>;

export const ResourceSuggestionInput = z
  .strictObject({
    chapterId: Uuid,
    title: z.string().trim().min(1).max(SEARCH_WEB_TITLE_MAX_LENGTH),
    url: SearchWebUrl,
    reason: z.string().trim().min(1).max(500),
  })
  .describe('Suggestion de ressource trouvée sur le web pour un chapitre.');
export type ResourceSuggestionInput = z.infer<typeof ResourceSuggestionInput>;

export const ResourceSuggestion = z
  .strictObject({
    id: Uuid,
    chapterId: Uuid,
    title: z.string().min(1).max(SEARCH_WEB_TITLE_MAX_LENGTH),
    url: SearchWebUrl,
    reason: z.string().min(1).max(500),
    status: ResourceSuggestionStatus,
    createdAt: IsoDateTime,
    /** True when the same canonical URL was already suggested for this chapter. */
    duplicate: z.boolean(),
  })
  .describe('Suggestion de ressource du tuteur, en attente de décision de l’apprenant.');
export type ResourceSuggestion = z.infer<typeof ResourceSuggestion>;
