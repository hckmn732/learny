// French message of an authentication failure (SPEC-3101 EF-5, CL-2, CA-4; ADR-0007, ADR-0121).
//
// Two families of failures reach the screens: `problem+json` answers of the API (an `AppError`)
// and errors of Supabase Auth (a plain object with `code`, `status` and `message`). This module
// turns both into the same small shape so that every form shows the web wording, never a
// technical detail and never the existence of an account (ADR-0121, BR-ACC-01).
import { isAppError } from '@learny/core';
import { fr } from '@learny/i18n';

/** Kind of failure; the screens only branch on this, never on a provider code. */
export type AuthFailureKind =
  | 'invalidCredentials'
  | 'emailNotConfirmed'
  | 'linkExpired'
  | 'rateLimited'
  | 'network'
  | 'validation'
  | 'generic';

export interface AuthFailure {
  readonly kind: AuthFailureKind;
  /** French sentence shown under the field or above the button (EF-5). */
  readonly message: string;
  /** Seconds to wait when the provider sent a delay, `null` otherwise (EF-5, BR-PLA-08). */
  readonly retryAfterSec: number | null;
}

/** Codes of the API and of Supabase Auth that map to a kind (compared case-insensitively). */
const KIND_BY_CODE: Readonly<Record<string, AuthFailureKind>> = {
  invalid_credentials: 'invalidCredentials',
  invalid_grant: 'invalidCredentials',
  email_not_confirmed: 'emailNotConfirmed',
  email_not_verified: 'emailNotConfirmed',
  otp_expired: 'linkExpired',
  token_has_expired: 'linkExpired',
  token_not_found: 'linkExpired',
  refresh_token_not_found: 'linkExpired',
  otp_disabled: 'linkExpired',
  over_email_send_rate_limit: 'rateLimited',
  over_request_rate_limit: 'rateLimited',
  rate_limited: 'rateLimited',
  resend_too_soon: 'rateLimited',
  validation_failed: 'validation',
  weak_password: 'validation',
  network_error: 'network',
  service_unavailable: 'network',
  internal_error: 'generic',
};

/** Supabase sends the delay inside the sentence of a rate limit, e.g. « after 42 seconds ». */
const RETRY_SECONDS = /after\s+(\d+)\s+seconds?/i;
const NETWORK_MESSAGE = /network|fetch|timeout|offline|connexion/i;

interface ErrorFacts {
  readonly code: string;
  readonly status: number | null;
  readonly message: string;
  readonly retryAfterSec: number | null;
}

function nonEmpty(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function factsOf(error: unknown): ErrorFacts {
  if (isAppError(error)) {
    return {
      code: error.code.toLowerCase(),
      status: error.status ?? null,
      message: error.message,
      retryAfterSec: error.retryAfterSec ?? null,
    };
  }
  if (typeof error === 'object' && error !== null) {
    const raw = error as Record<string, unknown>;
    const code = nonEmpty(raw.code) ?? '';
    const message = nonEmpty(raw.message) ?? '';
    const status = typeof raw.status === 'number' ? raw.status : null;
    const retry = RETRY_SECONDS.exec(message);
    return {
      code: code.toLowerCase(),
      status,
      message,
      retryAfterSec: retry === null ? null : Number(retry[1]),
    };
  }
  return {
    code: '',
    status: null,
    message: typeof error === 'string' ? error : '',
    retryAfterSec: null,
  };
}

function kindOf(facts: ErrorFacts): AuthFailureKind {
  if (facts.status === 429) return 'rateLimited';
  const direct = KIND_BY_CODE[facts.code];
  if (direct !== undefined) return direct;
  if (facts.status === 422 || facts.status === 400) return 'validation';
  if (NETWORK_MESSAGE.test(facts.message)) return 'network';
  return 'generic';
}

/** Message of a kind, with the delay of a rate limit when the provider sent one. */
function messageOf(kind: AuthFailureKind, retryAfterSec: number | null): string {
  if (kind === 'rateLimited') {
    // EF-5 — the delay is shown when known; the web sentence otherwise (BR-PLA-08).
    if (retryAfterSec !== null && retryAfterSec > 0) {
      return fr.mobile.errors.rateLimited.replace('{seconds}', String(Math.ceil(retryAfterSec)));
    }
    return fr.auth.errors.rateLimited;
  }
  switch (kind) {
    case 'invalidCredentials':
      return fr.auth.errors.invalidCredentials;
    case 'emailNotConfirmed':
      return fr.auth.errors.confirmationResent;
    case 'linkExpired':
      return fr.mobile.auth.callback.invalid;
    case 'network':
      return fr.auth.errors.network;
    case 'validation':
      return fr.mobile.errors.validationFailed;
    default:
      return fr.mobile.errors.generic;
  }
}

/** Describes any failure thrown by an authentication call (never throws, whatever it receives). */
export function describeAuthError(error: unknown): AuthFailure {
  const facts = factsOf(error);
  const kind = kindOf(facts);
  return {
    kind,
    message: messageOf(kind, facts.retryAfterSec),
    retryAfterSec: facts.retryAfterSec,
  };
}
