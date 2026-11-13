// Normalization of web search results (SPEC-512 ET-2, CL-3, CL-4).
//
// A provider answer is untrusted: only a public HTTP(S) URL survives, active HTML is removed,
// duplicates are collapsed on the canonical URL and provenance is kept. The same rules run for the
// native Anthropic route and the Tavily fallback, so both routes produce the same schema.
import {
  SEARCH_WEB_SNIPPET_MAX_LENGTH,
  SEARCH_WEB_TITLE_MAX_LENGTH,
  type SearchWebProvider as SearchWebProviderName,
  type SearchWebResult,
} from '@learny/contracts';

import { estimateTokens } from '../types';

const ACTIVE_BLOCK = /<(script|style|iframe|object|embed|noscript)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
const TAG = /<[^>]*>/g;
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;
const CONTROL = /[\p{Cc}]/gu;
const WHITESPACE = /\s+/g;
const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

/** ET-2 — removes active HTML and markup, decodes entities, collapses whitespace. */
export function plainText(value: string): string {
  return value
    .replace(ACTIVE_BLOCK, ' ')
    .replace(TAG, ' ')
    .replace(ENTITY, (_, body: string) => {
      const lower = body.toLowerCase();
      if (lower.startsWith('#x')) {
        const code = Number.parseInt(lower.slice(2), 16);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : ' ';
      }
      if (lower.startsWith('#')) {
        const code = Number.parseInt(lower.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code <= 0x10ffff
          ? String.fromCodePoint(code)
          : ' ';
      }
      return NAMED_ENTITIES[lower] ?? `&${body};`;
    })
    .replace(CONTROL, ' ')
    .replace(WHITESPACE, ' ')
    .trim();
}

function ipv4IsPrivate(host: string): boolean {
  const octets = host.split('.').map((part) => Number.parseInt(part, 10));
  const [a = -1, b = -1, c = -1] = octets;
  if (octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224
  );
}

function ipv6IsPrivate(host: string): boolean {
  const value = host.toLowerCase();
  if (value === '::' || value === '::1') return true;
  if (value.startsWith('::ffff:')) {
    const mapped = value.slice('::ffff:'.length);
    return IPV4.test(mapped) ? ipv4IsPrivate(mapped) : true;
  }
  return (
    value.startsWith('fc') ||
    value.startsWith('fd') ||
    value.startsWith('fe8') ||
    value.startsWith('fe9') ||
    value.startsWith('fea') ||
    value.startsWith('feb') ||
    value.startsWith('ff')
  );
}

/** ET-2 — a public host is neither loopback, private, link-local nor a local-only name. */
export function isPrivateHost(hostname: string): boolean {
  const host = hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
  if (host === '' || host === 'localhost') return true;
  if (host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) {
    return true;
  }
  if (host.endsWith('.home') || host.endsWith('.lan') || host.endsWith('.test')) return true;
  if (IPV4.test(host)) return ipv4IsPrivate(host);
  if (host.includes(':')) return ipv6IsPrivate(host);
  // A single label is not a public name (no dot, no IP literal).
  return !host.includes('.');
}

function parsePublicUrl(value: string | URL): URL | null {
  let url: URL;
  try {
    url = value instanceof URL ? new URL(value.toString()) : new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username !== '' || url.password !== '') return null;
  if (url.hostname === '' || url.port === '0') return null;
  if (isPrivateHost(url.hostname)) return null;
  return url;
}

/** ET-2 — true only for an absolute, public, credential-free HTTP(S) URL. */
export function isPublicHttpUrl(value: string | URL): boolean {
  return parsePublicUrl(value) !== null;
}

const TRACKING_PARAMETERS = new Set(['fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref_src']);

/**
 * ET-2, CL-4 — canonical form used for deduplication: lower-case host without `www.`, no fragment,
 * default port removed, tracking parameters removed, query keys sorted, trailing slash removed.
 */
export function canonicalizeUrl(value: string): string | null {
  const parsed = parsePublicUrl(value);
  if (parsed === null) return null;
  const url = parsed;
  url.hash = '';
  url.hostname = url.hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');
  if (url.pathname === '') url.pathname = '/';
  const trimmed = url.pathname.replace(/\/+$/, '');
  url.pathname = trimmed === '' ? '/' : trimmed;

  const kept: [string, string[]][] = [];
  for (const key of [...new Set(url.searchParams.keys())].sort()) {
    if (key.toLowerCase().startsWith('utm_') || TRACKING_PARAMETERS.has(key.toLowerCase())) {
      continue;
    }
    kept.push([key, url.searchParams.getAll(key)]);
  }
  url.search = '';
  for (const [key, values] of kept) {
    for (const entry of values) url.searchParams.append(key, entry);
  }
  return url.toString();
}

/** EF-3 — at most this many characters of a provider text field are kept. */
function clip(value: string, max: number): string {
  return Array.from(value).slice(0, max).join('');
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim() !== '') return value;
  }
  return undefined;
}

function isoDate(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const candidate = DATE_ONLY.test(value.trim()) ? `${value.trim()}T00:00:00.000Z` : value.trim();
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source web';
  }
}

/**
 * ET-2, ET-3 — provider output (unknown) → validated normalized results. Invalid URLs are
 * dropped before the model or the interface sees them; the first result of a canonical URL wins
 * because providers rank their answers.
 */
export function normalizeSearchResults(
  raw: unknown,
  provider: SearchWebProviderName,
): SearchWebResult[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const results: SearchWebResult[] = [];
  for (const item of raw) {
    if (item === null || typeof item !== 'object') continue;
    const record = item as Record<string, unknown>;
    const rawUrl = firstString(record, ['url', 'link']);
    if (rawUrl === undefined) continue;
    const url = canonicalizeUrl(rawUrl);
    if (url === null || seen.has(url)) continue;
    seen.add(url);
    const title =
      clip(
        plainText(firstString(record, ['title', 'name']) ?? hostnameOf(url)),
        SEARCH_WEB_TITLE_MAX_LENGTH,
      ) || hostnameOf(url);
    const snippet = clip(
      plainText(firstString(record, ['snippet', 'content', 'description']) ?? ''),
      SEARCH_WEB_SNIPPET_MAX_LENGTH,
    );
    const publishedAt = isoDate(record.publishedAt ?? record.published_date);
    const result: SearchWebResult = {
      title,
      url,
      snippet,
      provider,
      ...(publishedAt === undefined ? {} : { publishedAt }),
    };
    results.push(result);
  }
  return results;
}

export interface BudgetedSearchResults {
  results: SearchWebResult[];
  limited: boolean;
}

/**
 * ET-3 — cuts the answer to the task text budget. Whole results are kept first; when the last one
 * does not fit, its snippet is shortened and the answer is flagged as `limited`.
 */
export function fitResultsToBudget(
  results: readonly SearchWebResult[],
  maxTokens: number,
): BudgetedSearchResults {
  const kept: SearchWebResult[] = [];
  let used = 0;
  let limited = false;
  for (const result of results) {
    const cost = estimateTokens(JSON.stringify(result));
    if (used + cost <= maxTokens) {
      kept.push(result);
      used += cost;
      continue;
    }
    limited = true;
    const remaining = maxTokens - used - estimateTokens(JSON.stringify({ ...result, snippet: '' }));
    const characters = Math.min(result.snippet.length, Math.max(0, remaining) * 4);
    if (characters > 0) {
      kept.push({ ...result, snippet: result.snippet.slice(0, characters) });
    }
    break;
  }
  return { results: kept, limited };
}
