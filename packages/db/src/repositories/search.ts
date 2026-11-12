// Repository of the private full-text search (SPEC-112 EF-5, EF-6, ET-2, ET-3; ADR-0062,
// ADR-0217, ADR-0247).
//
// The SQL function `public.search_user_content` is SECURITY INVOKER: this module is always called
// with the learner's `userDb(ctx)` transaction so the RLS policies of `formations`, `notions`,
// `courses` and `course_sections` apply. The query is normalized here and passed as a bound
// parameter; it is never concatenated into SQL. Results are flat rows ordered by the database
// (rank descending, then a stable identifier); `groupSearchResults` restores the three groups of
// the interface in a fixed order.
import { sql } from 'drizzle-orm';
import { z } from 'zod';

import { AppError } from '@learny/core';

import type { DbTx } from '../client';
import {
  SNIPPET_MAX_LENGTH,
  normalizeSearchQuery,
  searchLimitSchema,
} from '../schema/privacy-search';

export const SEARCH_KINDS = ['formation', 'notion', 'section'] as const;

export type SearchKind = (typeof SEARCH_KINDS)[number];

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string;
  href: string;
  rank: number;
}

export interface SearchGroup {
  kind: SearchKind;
  items: SearchResult[];
}

export interface SearchInput {
  q: string;
  limit?: number;
}

interface Row {
  kind: unknown;
  id: unknown;
  title: unknown;
  snippet: unknown;
  href: unknown;
  rank: unknown;
  [key: string]: unknown;
}

const kindSchema = z.enum(SEARCH_KINDS);
const uuidSchema = z.uuid();
/** The SQL function bounds the snippet to 160 characters; accept the same bound on read. */
const snippetSchema = z.string().max(400);
const textSchema = z.string().min(1).max(400);
const hrefSchema = z.string().min(1).max(500);

function validationError(field: string, issues: string[]): AppError {
  return new AppError('VALIDATION_FAILED', `Champ « ${field} » invalide : ${issues.join(' ; ')}`, {
    errors: issues.map((message) => ({ path: field, message })),
  });
}

function parse<T>(schema: z.ZodType<T>, value: unknown, field: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw validationError(
      field,
      result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join('.') : '(racine)';
        return `${path} : ${issue.message}`;
      }),
    );
  }
  return result.data;
}

function toResult(row: Row): SearchResult {
  const rank = typeof row.rank === 'number' ? row.rank : Number(row.rank);
  if (!Number.isFinite(rank)) {
    throw new AppError('INVALID_RESPONSE', 'Rang de recherche invalide.');
  }
  return {
    kind: parse(kindSchema, row.kind, 'kind'),
    id: parse(uuidSchema, row.id, 'id'),
    title: parse(textSchema, row.title, 'title'),
    snippet: parse(snippetSchema, row.snippet ?? '', 'snippet'),
    href: parse(hrefSchema, row.href, 'href'),
    rank,
  };
}

/**
 * EF-5, ET-2 — runs the private search under the caller's JWT. An empty or whitespace-only query
 * returns no row without touching the database (CL-5). The limit is validated between 1 and 100;
 * the SQL function applies the same clamp for a direct caller.
 */
export async function searchUserContent(tx: DbTx, input: SearchInput): Promise<SearchResult[]> {
  const q = normalizeSearchQuery(input.q);
  if (q === '') return [];
  const limit = parse(searchLimitSchema, input.limit ?? 20, 'limit');

  const rows = await tx.execute<Row>(sql`
    select kind, id::text as id, title, snippet, href, rank
    from public.search_user_content(${q}, ${limit})
  `);
  return rows.map((row) => toResult(row));
}

/**
 * EF-5, EF-7 — fixed group order of the interface: formations, notions, then course sections.
 * Empty groups are omitted; the order of the rows inside a group is the database rank order.
 */
export function groupSearchResults(results: SearchResult[]): SearchGroup[] {
  return SEARCH_KINDS.flatMap((kind) => {
    const items = results.filter((result) => result.kind === kind);
    return items.length === 0 ? [] : [{ kind, items }];
  });
}

/** EF-6 — maximum length of a snippet returned by the SQL function (kept in sync with the SQL). */
export const MAX_SNIPPET_LENGTH = SNIPPET_MAX_LENGTH;
