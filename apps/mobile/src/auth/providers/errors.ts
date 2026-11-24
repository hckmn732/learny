// French message of a provider failure (SPEC-3402 EF-5, EF-6, CL-1, CL-2; ADR-0121).
//
// A cancellation is silent (EF-5); a provider that Supabase refuses (disabled, unknown client)
// gets the CL-2 sentence; an address already used by a password account gets the EF-6 sentence.
// The provider code is kept for the log of CL-2 — never the identity token or the nonce.
import { fr } from '@learny/i18n';

import { describeAuthError } from '../auth-errors';

export type ProviderFailureKind =
  'cancelled' | 'unavailable' | 'accountExists' | 'network' | 'generic';

export interface ProviderFailure {
  readonly kind: ProviderFailureKind;
  /** French sentence; empty for a cancellation, which never shows anything (EF-5). */
  readonly message: string;
  /** Provider code, logged by CL-2 without any token. */
  readonly code: string | null;
}

const CANCELLED_CODES: readonly string[] = [
  'sign_in_cancelled',
  'err_canceled',
  'err_request_canceled',
  'err_request_cancelled',
  'authorizationerrorcanceled',
  'popup_closed',
  'user_cancelled',
];

const UNAVAILABLE_CODES: readonly string[] = [
  'provider_disabled',
  'provider_not_enabled',
  'play_services_not_available',
  'null_presenter',
  'unsupported',
];

const ACCOUNT_EXISTS_CODES: readonly string[] = [
  'identity_already_exists',
  'email_exists',
  'user_already_exists',
  'manual_linking_disabled',
];

const CANCELLED_MESSAGE = /cancel/i;
const UNAVAILABLE_MESSAGE = /not enabled|provider is not|unsupported|play services/i;

function factsOf(error: unknown): { code: string | null; message: string } {
  if (typeof error !== 'object' || error === null) {
    return { code: null, message: typeof error === 'string' ? error : '' };
  }
  const raw = error as { code?: unknown; message?: unknown };
  return {
    code: typeof raw.code === 'string' && raw.code !== '' ? raw.code.toLowerCase() : null,
    message: typeof raw.message === 'string' ? raw.message : '',
  };
}

/** Describes any failure of a provider or of its exchange with Supabase (never throws). */
export function providerFailureOf(error: unknown): ProviderFailure {
  const facts = factsOf(error);
  const code = facts.code;

  if (code !== null && CANCELLED_CODES.includes(code)) {
    return { kind: 'cancelled', message: '', code };
  }
  if (CANCELLED_MESSAGE.test(code ?? '') || CANCELLED_MESSAGE.test(facts.message)) {
    // Defensive: a cancel is never an error for the learner (EF-5, CA-3).
    if (code === null || !ACCOUNT_EXISTS_CODES.includes(code)) {
      return { kind: 'cancelled', message: '', code };
    }
  }
  if (code !== null && ACCOUNT_EXISTS_CODES.includes(code)) {
    return { kind: 'accountExists', message: fr.mobile.auth.providers.accountExists, code };
  }
  if (
    (code !== null && UNAVAILABLE_CODES.includes(code)) ||
    UNAVAILABLE_MESSAGE.test(facts.message) ||
    UNAVAILABLE_MESSAGE.test(code ?? '')
  ) {
    return { kind: 'unavailable', message: fr.mobile.auth.providers.unavailable, code };
  }
  const described = describeAuthError(error);
  if (described.kind === 'network') {
    return { kind: 'network', message: described.message, code };
  }
  return { kind: 'generic', message: fr.mobile.errors.generic, code };
}
