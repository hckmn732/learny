// Content-Security-Policy of the web application (SPEC-805 EF-1, ET-1, CA-1).
//
// The policy is built from a versioned list of sources. Only the integrations the application
// really uses may enter it: a source is normalised to an http(s) origin and anything else is
// dropped, so an environment value can never inject a scheme such as `javascript:` or `data:`
// into `script-src`. The nonce is cryptographically random, generated once per request and reused
// for every script of the same response (ADR-0042).
import { randomBytes } from 'node:crypto';

/** 18 random bytes give a 24-character base64 nonce, well above the 128-bit guidance. */
export const CSP_NONCE_BYTES = 18;

/** Versioned directive list: changing it is a deliberate security decision. */
export const CSP_POLICY_VERSION = 1;

export interface CspEnvironment {
  /** `NEXT_PUBLIC_SUPABASE_URL`: browser auth and Storage calls. */
  supabaseUrl?: string;
  /** `NEXT_PUBLIC_SENTRY_DSN`: optional client error reporting. */
  sentryDsn?: string;
  /** Production adds `upgrade-insecure-requests`; local HTTP keeps it out. */
  production?: boolean;
}

const NONCE_PATTERN = /^[A-Za-z0-9+/]{16,}={0,2}$/;
const ORIGIN_PATTERN = /^https?:\/\/[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?(?::\d{1,5})?$/i;

/**
 * Normalises an environment value to a safe CSP origin. A malformed value, credentials, a path or
 * a non-http(s) scheme returns `null` and is ignored instead of being copied into the policy.
 */
export function normalizeCspOrigin(
  value: string | undefined,
  allowCredentials = false,
): string | null {
  if (value === undefined || value.trim() === '') return null;
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!allowCredentials && (url.username !== '' || url.password !== '')) return null;
  const origin = url.origin;
  return ORIGIN_PATTERN.test(origin) ? origin : null;
}

/** True only for a nonce shaped by `createCspNonce`; rejects quotes and injected directives. */
export function isValidCspNonce(nonce: string): boolean {
  return NONCE_PATTERN.test(nonce);
}

/** Cryptographically random nonce, base64 encoded. The random source is injectable for tests. */
export function createCspNonce(random: (size: number) => Buffer = randomBytes): string {
  return random(CSP_NONCE_BYTES).toString('base64');
}

function websocketOrigin(origin: string): string | null {
  try {
    const url = new URL(origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return url.origin;
  } catch {
    return null;
  }
}

function unique(values: readonly (string | null)[]): string[] {
  return [...new Set(values.filter((value): value is string => value !== null))];
}

/** Exact list of external origins the browser may reach for each directive. */
export function cspSources(env: CspEnvironment = {}) {
  const supabase = normalizeCspOrigin(env.supabaseUrl);
  // A Sentry DSN carries its public key as userinfo; only its origin enters the policy.
  const sentry = normalizeCspOrigin(env.sentryDsn, true);
  return {
    connect: unique([
      "'self'",
      supabase,
      supabase === null ? null : websocketOrigin(supabase),
      sentry,
    ]),
    img: unique(["'self'", 'data:', 'blob:', supabase]),
    frame: ["'self'"],
  } as const;
}

/**
 * Builds the policy for one response. `script-src` never contains `unsafe-eval` nor
 * `unsafe-inline`: Next.js scripts receive the nonce, and `strict-dynamic` trusts only the
 * scripts they load. `style-src` is nonce-based too, so no inline style escapes the nonce.
 */
export function buildContentSecurityPolicy(nonce: string, env: CspEnvironment = {}): string {
  if (!isValidCspNonce(nonce)) {
    throw new Error('Nonce CSP invalide.');
  }
  const sources = cspSources(env);
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    `style-src 'self' 'nonce-${nonce}'`,
    `img-src ${sources.img.join(' ')}`,
    "font-src 'self' data:",
    `connect-src ${sources.connect.join(' ')}`,
    `frame-src ${sources.frame.join(' ')}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (env.production === true) directives.push('upgrade-insecure-requests');
  return `${directives.join('; ')};`;
}
