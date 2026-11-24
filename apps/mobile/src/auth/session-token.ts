// Current access token and single renewal (SPEC-3003 ET-2, CL-1, CL-2; ADR-3008 § 3).
//
// `api-client` asks this module for the Bearer header before every attempt and calls
// `refreshSessionOnce()` after a 401. The renewal is serialised here: ten requests that receive a
// 401 at the same instant share one promise, so the Auth server sees exactly one refresh and the
// refresh token is never rotated twice concurrently (CL-1).
export type TokenReader = () => string | null;
export type TokenRenewal = () => Promise<string | null>;
export type SessionExpiredHandler = () => void;

let accessToken: string | null = null;
let renewal: TokenRenewal | null = null;
let onExpired: SessionExpiredHandler | null = null;
let inFlight: Promise<boolean> | null = null;

/** Installs the token read by the API client (`null` before the session is restored). */
export function setSessionToken(token: string | null): void {
  accessToken = token;
}

/** Current access token, or `null` when signed out. */
export function getSessionToken(): string | null {
  return accessToken;
}

/** Registers the renewal of the session (Supabase `refreshSession`). */
export function setRenewalHandler(handler: TokenRenewal | null): void {
  renewal = handler;
}

/** Registers what happens when the renewal is refused (local sign-out, purge, sign-in screen). */
export function setExpiredHandler(handler: SessionExpiredHandler | null): void {
  onExpired = handler;
}

/**
 * Renews the session once and returns whether a new token is available (ET-2).
 *
 * Concurrent callers share the same promise: one renewal, then every replay proceeds (CL-1). A
 * refused renewal clears the token and calls the expired handler exactly once for the burst
 * (CL-2).
 */
export function refreshSessionOnce(): Promise<boolean> {
  if (inFlight !== null) return inFlight;
  const pending = (async () => {
    try {
      const current = renewal;
      const next = current === null ? null : await current();
      if (next === null || next === '') {
        accessToken = null;
        onExpired?.();
        return false;
      }
      accessToken = next;
      return true;
    } catch {
      accessToken = null;
      onExpired?.();
      return false;
    } finally {
      inFlight = null;
    }
  })();
  inFlight = pending;
  return pending;
}

/** Drops every handler and the token (tests, sign-out): the next launch starts from scratch. */
export function resetSessionTokenState(): void {
  accessToken = null;
  renewal = null;
  onExpired = null;
  inFlight = null;
}
