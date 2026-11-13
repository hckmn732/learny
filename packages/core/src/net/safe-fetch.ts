// Bounded, anti-SSRF retrieval of a user-supplied URL (SPEC-510 ET-1, EF-5; ADR-0159).
//
// Every hop is validated by `resolvePublicUrl`, the connection is pinned on the verified address
// (no second DNS resolution can rebind it), redirects are followed manually and re-checked, the
// body is read in a stream with a hard byte bound, the whole exchange has one total deadline and
// robots.txt is honoured for `LearnyBot`. No global `fetch` is used: the default transport is
// `node:http`/`node:https` with an explicit `lookup`, and tests inject a transport that never
// opens a socket (ET-5).
import { request as httpRequest, type IncomingHttpHeaders, type RequestOptions } from 'node:http';
import { request as httpsRequest } from 'node:https';
import type { LookupFunction } from 'node:net';

import { AppError, isAppError } from '../errors';

import { resolvePublicUrl, type ResolvedAddress } from './assert-public-url';

/** ADR-0057 — 15 s and 5 MB for a page, 5 s and 512 KB for its robots.txt. */
export const SAFE_FETCH_TIMEOUT_MS = 15_000;
export const SAFE_FETCH_MAX_BYTES = 5 * 1_048_576;
export const SAFE_FETCH_MAX_REDIRECTS = 5;
export const DEFAULT_ROBOTS_TIMEOUT_MS = 5_000;
export const DEFAULT_ROBOTS_MAX_BYTES = 512 * 1_024;
export const ROBOTS_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
export const LEARNY_BOT_AGENT = 'LearnyBot/1.0 (+https://learny.app/bot)';

export interface SafeFetchResponse {
  status: number;
  headers: IncomingHttpHeaders;
  body: AsyncIterable<Uint8Array>;
}

export interface SafeFetchRequest {
  url: URL;
  /** Verified address to pin the socket on; `null` when `allowPrivate` skipped DNS. */
  address: ResolvedAddress | null;
  headers: Readonly<Record<string, string>>;
  signal: AbortSignal;
}

export type SafeFetchTransport = (request: SafeFetchRequest) => Promise<SafeFetchResponse>;

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** ADR-0159 point 7 — local-model exception, never used by the ingestion. */
  allowPrivate?: boolean;
  /** DNS seam of the tests; production resolves every address with `dns.lookup`. */
  lookup?: (hostname: string) => Promise<readonly ResolvedAddress[]>;
  /** Defaults to true; the ingestion always keeps it on. */
  respectRobots?: boolean;
  robotsTimeoutMs?: number;
  robotsMaxBytes?: number;
  userAgent?: string;
  accept?: string;
  /** Test seam: replaces the socket transport, the URL validation still runs before it. */
  transport?: SafeFetchTransport;
}

export interface SafeFetchResult {
  status: number;
  /** Final URL after redirects. */
  url: string;
  contentType: string | null;
  body: Uint8Array;
}

interface RobotsGroup {
  agents: string[];
  rules: { allow: boolean; pattern: string }[];
}

interface RobotsEntry {
  text: string;
  expiresAt: number;
}

const robotsCache = new Map<string, RobotsEntry>();

/** Removes the process-wide robots cache; used by the deterministic tests. */
export function clearRobotsCache(): void {
  robotsCache.clear();
}

function timedOut(): AppError {
  return new AppError('FETCH_TIMEOUT', 'Le site n’a pas répondu dans le délai de 15 secondes.', {
    status: 504,
  });
}

function tooLarge(maxBytes: number): AppError {
  return new AppError(
    'FETCH_TOO_LARGE',
    `La page dépasse la limite de ${String(Math.max(1, Math.floor(maxBytes / 1_048_576)))} Mo.`,
    { status: 422 },
  );
}

function failed(detail: string, cause?: unknown): AppError {
  return new AppError('FETCH_FAILED', detail, {
    status: 503,
    ...(cause === undefined ? {} : { cause }),
  });
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError');
}

function header(headers: IncomingHttpHeaders, name: string): string | null {
  const value = headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function decodeBody(body: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: false }).decode(body);
}

/** Pins `net.connect` on the address validated for this hop (ADR-0159 point 2). */
function pinnedLookup(address: ResolvedAddress): LookupFunction {
  const lookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all === true) {
      callback(null, [{ address: address.address, family: address.family }]);
      return;
    }
    callback(null, address.address, address.family);
  };
  return lookup;
}

/** Default transport: one request, no redirect following, signal and pinned address honoured. */
const nodeTransport: SafeFetchTransport = (input) =>
  new Promise((resolve, reject) => {
    const options: RequestOptions = {
      method: 'GET',
      headers: input.headers,
      signal: input.signal,
      ...(input.address === null ? {} : { lookup: pinnedLookup(input.address) }),
    };
    const send = input.url.protocol === 'https:' ? httpsRequest : httpRequest;
    const request = send(input.url, options, (response) => {
      resolve({ status: response.statusCode ?? 0, headers: response.headers, body: response });
    });
    request.on('error', reject);
    request.end();
  });

async function readBody(
  body: AsyncIterable<Uint8Array>,
  maxBytes: number,
  controller: AbortController,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for await (const chunk of body) {
      total += chunk.length;
      if (total > maxBytes) {
        controller.abort();
        throw tooLarge(maxBytes);
      }
      chunks.push(chunk);
    }
  } catch (error) {
    if (isAppError(error)) throw error;
    if (isAbort(error)) throw timedOut();
    throw failed('La lecture de la page a échoué.', error);
  }
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function ruleMatches(pattern: string, path: string): boolean {
  if (pattern === '') return false;
  const anchored = pattern.endsWith('$');
  const source = anchored ? pattern.slice(0, -1) : pattern;
  const expression = source
    .split('*')
    .map((part) => escapeRegex(part))
    .join('.*');
  return new RegExp(`^${expression}${anchored ? '$' : ''}`).test(path);
}

function groupsOf(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let agents: string[] = [];
  let rules: RobotsGroup['rules'] = [];
  let inRules = false;
  const flush = (): void => {
    if (agents.length > 0) groups.push({ agents, rules });
    agents = [];
    rules = [];
    inRules = false;
  };
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0]?.trim() ?? '';
    if (line === '') continue;
    const separator = line.indexOf(':');
    if (separator === -1) continue;
    const key = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (key === 'user-agent') {
      if (inRules) flush();
      agents.push(value.toLowerCase());
      continue;
    }
    if (key === 'allow' || key === 'disallow') {
      if (agents.length === 0) continue;
      inRules = true;
      rules.push({ allow: key === 'allow', pattern: value });
    }
  }
  flush();
  return groups;
}

/** True when the robots.txt of a site allows `userAgent` on `path` (longest rule wins). */
export function isAllowedByRobots(userAgent: string, path: string, text: string): boolean {
  const token = userAgent.split('/')[0]?.toLowerCase() ?? userAgent.toLowerCase();
  const matching = groupsOf(text).filter((group) =>
    group.agents.some((agent) => agent === '*' || token.includes(agent)),
  );
  if (matching.length === 0) return true;
  let best: { allow: boolean; length: number } | null = null;
  for (const group of matching) {
    for (const rule of group.rules) {
      if (!ruleMatches(rule.pattern, path)) continue;
      const length = rule.pattern.length;
      if (best === null || length > best.length || (length === best.length && rule.allow)) {
        best = { allow: rule.allow, length };
      }
    }
  }
  return best === null || best.allow;
}

async function robotsAllows(url: URL, options: SafeFetchOptions): Promise<boolean> {
  const origin = url.origin;
  const now = performance.now();
  const cached = robotsCache.get(origin);
  let text: string;
  if (cached !== undefined && cached.expiresAt > now) {
    text = cached.text;
  } else {
    text = '';
    try {
      const response = await safeFetch(new URL('/robots.txt', origin).href, {
        ...options,
        respectRobots: false,
        timeoutMs: options.robotsTimeoutMs ?? DEFAULT_ROBOTS_TIMEOUT_MS,
        maxBytes: options.robotsMaxBytes ?? DEFAULT_ROBOTS_MAX_BYTES,
        maxRedirects: 2,
      });
      text = decodeBody(response.body);
    } catch {
      // An absent or unreadable robots.txt does not forbid a public page (RFC 9309 §2.3.1.4).
    }
    robotsCache.set(origin, { text, expiresAt: performance.now() + ROBOTS_CACHE_TTL_MS });
  }
  return isAllowedByRobots(
    options.userAgent ?? LEARNY_BOT_AGENT,
    `${url.pathname}${url.search}`,
    text,
  );
}

/**
 * ADR-0159 — fetches a user URL with every guard enabled. Throws a typed `AppError` before any
 * request for a forbidden address, and a bounded code for a timeout, an oversized body, a bad
 * status or too many redirects. The returned body is complete and never partial.
 */
export async function safeFetch(
  input: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? SAFE_FETCH_TIMEOUT_MS;
  const maxBytes = options.maxBytes ?? SAFE_FETCH_MAX_BYTES;
  const maxRedirects = options.maxRedirects ?? SAFE_FETCH_MAX_REDIRECTS;
  const transport = options.transport ?? nodeTransport;
  const controller = new AbortController();
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  const signal = AbortSignal.any([controller.signal, timeoutSignal]);
  let target = input.trim();

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const resolution = await resolvePublicUrl(target, options);
    if (options.respectRobots !== false && !(await robotsAllows(resolution.url, options))) {
      throw new AppError(
        'WEB_ROBOTS_DISALLOWED',
        'Le site interdit la lecture de cette page par LearnyBot (robots.txt).',
        { status: 422 },
      );
    }
    let response: SafeFetchResponse;
    try {
      response = await transport({
        url: resolution.url,
        address: resolution.addresses[0] ?? null,
        headers: {
          'user-agent': options.userAgent ?? LEARNY_BOT_AGENT,
          accept: options.accept ?? 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1',
          'accept-encoding': 'identity',
          'accept-language': 'fr-FR,fr;q=0.9,en;q=0.5',
        },
        signal,
      });
    } catch (error) {
      if (isAbort(error) || signal.aborted) throw timedOut();
      if (isAppError(error)) throw error;
      throw failed('Le site n’a pas pu être contacté.', error);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = header(response.headers, 'location');
      if (location === null) {
        throw new AppError('FETCH_HTTP_ERROR', 'La redirection du site est incomplète.', {
          status: response.status,
        });
      }
      if (hop === maxRedirects) {
        throw new AppError(
          'FETCH_TOO_MANY_REDIRECTS',
          'Le site redirige trop de fois pour être lu.',
          { status: 422 },
        );
      }
      target = new URL(location, resolution.url).href;
      continue;
    }
    if (response.status >= 400) {
      throw new AppError(
        'FETCH_HTTP_ERROR',
        `Le site a répondu avec le statut ${String(response.status)}.`,
        { status: response.status },
      );
    }
    try {
      const body = await readBody(response.body, maxBytes, controller);
      return {
        status: response.status,
        url: resolution.url.href,
        contentType: header(response.headers, 'content-type'),
        body,
      };
    } catch (error) {
      if (isAppError(error)) throw error;
      if (isAbort(error) || signal.aborted) throw timedOut();
      throw failed('La page n’a pas pu être lue.', error);
    }
  }
  throw new AppError('FETCH_TOO_MANY_REDIRECTS', 'Le site redirige trop de fois pour être lu.', {
    status: 422,
  });
}
