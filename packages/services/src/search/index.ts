// Global search service (SPEC-212 EF-1 to EF-5, ET-2, ET-4, ET-5; BR-NAV-05, ADR-0062, ADR-0217).
//
// The query is validated and normalized first: a query out of bounds never reaches SQL (CL-1). The
// private SQL function `search_user_content` runs under the caller's JWT (`ctx.db`, Row Level
// Security active, SECURITY INVOKER) with the normalized text as a bound parameter and
// `min(100, 3 × limit)` rows, then the rows are grouped by kind in the fixed order, sorted, cut to
// `limit` and turned into plain-text snippets with highlight positions. Only the length of the
// query and the number of results are logged, never the text.
import {
  InternalHref,
  SEARCH_GROUP_LABELS,
  SEARCH_KINDS,
  SearchQuery,
  type SearchGroup,
  type SearchItem,
  type SearchKind,
  type SearchResponse,
} from '@learny/contracts';
import { AppError, type Result } from '@learny/core';
import {
  searchUserContent as queryUserContent,
  sql,
  type DbTx,
  type SearchResult,
} from '@learny/db';

import type { ServiceContext } from '../context';
import { requireUser, toResult } from '../resources/result';

import { buildSnippet, computeHighlights, toPlainTitle } from './highlight';

export { buildSnippet, computeHighlights, toPlainText, toPlainTitle } from './highlight';
export { fold, normalizeQuery, queryTerms } from './normalize';

/** ET-2 — the SQL function returns at most this many rows. */
export const SEARCH_SQL_MAX_ROWS = 100;
/** ET-2 — rows requested from SQL for each row shown, so that `total` is meaningful. */
export const SEARCH_SQL_QUOTA_FACTOR = 3;

export interface SearchInput {
  q: string;
  limit?: number | undefined;
}

/** The kinds of the SQL function (`section`) and of the API (`chapter`) differ by name only. */
const KIND_OF_SQL: Record<SearchResult['kind'], SearchKind> = {
  notion: 'notion',
  section: 'chapter',
  formation: 'formation',
};

function parseInput(input: SearchInput): SearchQuery {
  const parsed = SearchQuery.safeParse({ q: input.q, limit: input.limit });
  if (parsed.success) return parsed.data;
  throw new AppError('VALIDATION_FAILED', 'Les données envoyées sont invalides.', {
    errors: parsed.error.issues.map((issue) => ({
      path: ['query', ...issue.path.map(String)].join('.'),
      message: issue.message,
    })),
  });
}

interface Hit {
  kind: SearchKind;
  id: string;
  title: string;
  snippet: string;
  href: string;
  rank: number;
}

/** EF-5 — a link is an internal relative path; anything else is dropped, never shown. */
function toHits(rows: SearchResult[], ctx: ServiceContext): Hit[] {
  const hits: Hit[] = [];
  for (const row of rows) {
    if (!InternalHref.safeParse(row.href).success) {
      ctx.logger.error('search result dropped', { code: 'INTERNAL_ERROR', operation: 'search' });
      continue;
    }
    hits.push({
      kind: KIND_OF_SQL[row.kind],
      id: row.id,
      title: row.title,
      snippet: row.snippet,
      href: row.href,
      rank: row.rank,
    });
  }
  return hits;
}

/** EF-3 — rank descending, then identifier ascending: a total, stable order. */
function byRankThenId(left: Hit, right: Hit): number {
  if (left.rank !== right.rank) return right.rank - left.rank;
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

interface BodyRow {
  id: unknown;
  body: unknown;
  [key: string]: unknown;
}

/**
 * CL-7 — the SQL snippet only holds the start of a long text. The full text of the rows that are
 * shown is read again, under the same JWT and the same Row Level Security, to centre the snippet on
 * the first match wherever it is. Section ids, notion ids and formation ids are all UUIDs.
 */
async function loadBodies(tx: DbTx, shown: Hit[]): Promise<Map<string, string>> {
  const idsOf = (kind: SearchKind) =>
    sql.join(
      shown.filter((hit) => hit.kind === kind).map((hit) => sql`${hit.id}::uuid`),
      sql`, `,
    );
  const parts = [
    [
      'notion',
      (list: ReturnType<typeof idsOf>) =>
        sql`select id, short_definition as body from public.notions where id in (${list})`,
    ],
    [
      'chapter',
      (list: ReturnType<typeof idsOf>) =>
        sql`select id, content_md as body from public.course_sections where id in (${list})`,
    ],
    [
      'formation',
      (list: ReturnType<typeof idsOf>) =>
        sql`select id, description as body from public.formations where id in (${list})`,
    ],
  ] as const;
  const selects = parts
    .filter(([kind]) => shown.some((hit) => hit.kind === kind))
    .map(([kind, select]) => select(idsOf(kind)));
  const bodies = new Map<string, string>();
  if (selects.length === 0) return bodies;
  const rows = await tx.execute<BodyRow>(
    sql`select b.id::text as id, b.body from (${sql.join(selects, sql` union all `)}) b`,
  );
  for (const row of rows) {
    if (typeof row.id === 'string' && typeof row.body === 'string') bodies.set(row.id, row.body);
  }
  return bodies;
}

function toItem(hit: Hit, bodies: Map<string, string>, query: string): SearchItem {
  const title = toPlainTitle(hit.title);
  const { snippet, highlights } = buildSnippet(bodies.get(hit.id) ?? hit.snippet, query);
  return {
    id: hit.id,
    title,
    snippet,
    highlights,
    titleHighlights: computeHighlights(title, query),
    href: hit.href,
  };
}

/**
 * EF-1 to EF-5 — `GET /api/v1/search`. Returns the groups that have at least one result, in the
 * fixed order Notions, Chapitres, Formations; `groups: []` when nothing matches.
 */
export function searchUserContent(
  ctx: ServiceContext,
  input: SearchInput,
): Promise<Result<SearchResponse>> {
  return toResult(async () => {
    const { db } = requireUser(ctx);
    const { q, limit } = parseInput(input);
    const rowLimit = Math.min(SEARCH_SQL_MAX_ROWS, SEARCH_SQL_QUOTA_FACTOR * limit);

    const response = await db.run(async (tx): Promise<SearchResponse> => {
      const rows = await queryUserContent(tx, { q, limit: rowLimit });
      const hits = toHits(rows, ctx);

      const grouped = SEARCH_KINDS.map((kind) => {
        const ofKind = hits.filter((hit) => hit.kind === kind).sort(byRankThenId);
        return { kind, total: ofKind.length, shown: ofKind.slice(0, limit) };
      }).filter((group) => group.total > 0);

      const bodies = await loadBodies(
        tx,
        grouped.flatMap((group) => group.shown),
      );
      const groups: SearchGroup[] = grouped.map((group) => ({
        kind: group.kind,
        label: SEARCH_GROUP_LABELS[group.kind],
        items: group.shown.map((hit) => toItem(hit, bodies, q)),
        total: group.total,
      }));
      return { query: q, groups };
    });

    // ET-5 — the text of the query is personal: only its length and the result count are kept.
    ctx.logger.info('search completed', {
      operation: 'search',
      queryLength: Array.from(response.query).length,
      resultCount: response.groups.reduce((sum, group) => sum + group.items.length, 0),
    });
    return response;
  });
}
