// French message of an API error (SPEC-3003 EF-7, CL-2, CL-3; BR-PLA-08).
//
// `messageFor` never leaks a technical detail: the code of `problem+json` becomes a French
// sentence, `429` carries the delay of `Retry-After`, and anything unknown falls back to the
// generic sentence. Labels live in `@learny/i18n` (espace `mobile.errors`), never in this file.
import { ERROR_CATALOG, isAppError } from '@learny/core';
import { fr } from '@learny/i18n';

/** Fallback sentence of EF-7. */
export const GENERIC_ERROR_MESSAGE: string = fr.mobile.errors.generic;

/** Sentences that refine a code of the catalogue for the mobile client (EF-7). */
const BY_CODE: Readonly<Record<string, string>> = {
  UNAUTHENTICATED: fr.mobile.errors.unauthorized,
  INVALID_CREDENTIALS: fr.mobile.errors.unauthorized,
  FORBIDDEN: fr.mobile.errors.forbidden,
  ORIGIN_REJECTED: fr.mobile.errors.forbidden,
  NOT_FOUND: fr.mobile.errors.notFound,
  VALIDATION_FAILED: fr.mobile.errors.validationFailed,
  NETWORK_ERROR: fr.mobile.errors.network,
  SERVICE_UNAVAILABLE: fr.mobile.errors.serviceUnavailable,
  CONFLICT: fr.mobile.errors.conflict,
};

const CATALOG = ERROR_CATALOG as Readonly<Record<string, { status: number; title: string }>>;

/** French message of `error` (EF-7). Never throws, whatever it receives. */
export function messageFor(error: unknown): string {
  if (!isAppError(error)) return GENERIC_ERROR_MESSAGE;

  // BR-PLA-08 — the delay comes from the response header, with a floor of one second.
  if (error.status === 429 || error.code === 'RATE_LIMITED' || error.code === 'RESEND_TOO_SOON') {
    const seconds = Math.max(1, error.retryAfterSec ?? 1);
    return fr.mobile.errors.rateLimited.replace('{seconds}', String(seconds));
  }

  const refined = BY_CODE[error.code];
  if (refined !== undefined) return refined;
  const known = CATALOG[error.code];
  return known === undefined ? GENERIC_ERROR_MESSAGE : known.title;
}

/**
 * Delay to observe before retrying, in milliseconds (BR-PLA-08): `Retry-After` of the answer,
 * `0` when the error carries none — the client never fires a burst of attempts.
 */
export function retryAfterMs(error: unknown): number {
  if (!isAppError(error)) return 0;
  const seconds = error.retryAfterSec;
  return seconds === undefined || seconds <= 0 ? 0 : Math.ceil(seconds) * 1000;
}

/** True when the error means the session is over and the sign-in screen must come back (EF-3). */
export function isSessionExpired(error: unknown): boolean {
  return isAppError(error) && error.status === 401 && error.code !== 'INVALID_CREDENTIALS';
}

/** Label shown after a refused renewal (EF-3, CL-2). */
export function sessionExpiredMessage(): string {
  return fr.mobile.session.expired;
}
