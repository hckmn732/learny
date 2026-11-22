// Sign-in, magic link and callback of the native application (SPEC-3101 EF-3, EF-6, ET-1;
// ADR-3008 § 4 et § 5, ADR-3017).
//
// The application talks to Supabase Auth directly (never to a new `/auth/*` route of the API,
// ADR-3008 § 4) and exchanges the code or the `token_hash` of the received link. The client is
// injected so that the rules of this module — non-enumeration, redirect, single-use link — are
// tested in Node without a native Auth client (Vitest, Jest). The module imports **nothing** that
// reaches Expo: the native client lives in `native-auth.ts`.
import type { Session } from '@supabase/supabase-js';

import type { CallbackType } from './link-types';
import type { SessionSnapshot } from './session-port';

export {
  CALLBACK_TYPES,
  MAGIC_LINK_REDIRECT,
  isCallbackType,
  type CallbackType,
} from './link-types';

/** Answer of a Supabase Auth call, reduced to what this module reads. */
export interface AuthResult {
  readonly error: unknown;
  readonly data?: { readonly session?: unknown } | null;
}

/** Surface of Supabase Auth used by the application; the tests pass a fake implementation. */
export interface EmailAuthClient {
  signInWithPassword(credentials: { email: string; password: string }): Promise<AuthResult>;
  signInWithOtp(credentials: {
    email: string;
    options: { shouldCreateUser: boolean; emailRedirectTo?: string };
  }): Promise<AuthResult>;
  verifyOtp(params: { token_hash: string; type: CallbackType }): Promise<AuthResult>;
  exchangeCodeForSession(code: string): Promise<AuthResult>;
}

/**
 * Codes answered when the address is unknown while the account creation is refused: the screen
 * shows the very same neutral sentence (ADR-0121, EF-3, CA-4) instead of revealing the absence.
 */
const SILENT_MAGIC_LINK_CODES: readonly string[] = [
  'otp_disabled',
  'user_not_found',
  'signup_disabled',
];

/** Outcome of a magic-link request: `sent` and `silent` are indistinguishable for the user. */
export type MagicLinkOutcome = 'sent' | 'silent';

/**
 * Error thrown by this module when the provider refuses: it carries the provider code and status
 * so that `describeAuthError` maps it to a French sentence (EF-5). Throwing an `Error` keeps the
 * lint rule `only-throw-error` satisfied and never leaks a raw provider payload.
 */
export class AuthCallError extends Error {
  readonly code: string;
  readonly status: number | null;

  constructor(cause: unknown) {
    const facts =
      typeof cause === 'object' && cause !== null
        ? (cause as { code?: unknown; status?: unknown; message?: unknown })
        : {};
    super(
      typeof facts.message === 'string' && facts.message !== ''
        ? facts.message
        : 'Échec de l’authentification.',
    );
    this.name = 'AuthCallError';
    this.code = typeof facts.code === 'string' ? facts.code : '';
    this.status = typeof facts.status === 'number' ? facts.status : null;
  }
}

/** Wraps a provider refusal into the error of the module. */
export function authFailure(cause: unknown): AuthCallError {
  return new AuthCallError(cause);
}

function codeOf(error: unknown): string {
  if (typeof error !== 'object' || error === null) return '';
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code.toLowerCase() : '';
}

/** Maps a Supabase session to the snapshot of the application; never exposes a token. */
function snapshotFrom(session: Session | null): SessionSnapshot | null {
  if (session === null) return null;
  return {
    userId: session.user.id,
    accessToken: session.access_token,
    email: session.user.email ?? null,
  };
}

/**
 * Password sign-in (BR-ACC-01, ET-1). The session is published by `onAuthStateChange`, so the
 * provider of `session.tsx` updates by itself; a failure is thrown as received and described by
 * `describeAuthError` (EF-5).
 */
export async function signInWithPassword(
  client: EmailAuthClient,
  email: string,
  password: string,
): Promise<void> {
  const { error } = await client.signInWithPassword({ email: email.trim(), password });
  if (error !== null && error !== undefined) throw authFailure(error);
}

/**
 * Sends the magic link of the application (EF-3, ET-1): a one-hour, single-use link
 * (BR-ACC-01), never creating an account (`shouldCreateUser: false`) and coming back to
 * `learny://auth/callback`. An unknown address is answered like a known one (CA-4).
 */
export async function requestMagicLink(
  client: EmailAuthClient,
  email: string,
  redirect: string = 'learny://auth/callback',
): Promise<MagicLinkOutcome> {
  const { error } = await client.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: false, emailRedirectTo: redirect },
  });
  if (error === null || error === undefined) return 'sent';
  if (SILENT_MAGIC_LINK_CODES.includes(codeOf(error))) return 'silent';
  throw authFailure(error);
}

function sessionOf(result: AuthResult): SessionSnapshot {
  if (result.error !== null && result.error !== undefined) throw authFailure(result.error);
  const snapshot = snapshotFrom((result.data?.session ?? null) as Session | null);
  if (snapshot === null) throw new Error('Session absente après la vérification du lien.');
  return snapshot;
}

/**
 * Verifies a link that carries a `token_hash` (the e-mails of the project point at the API
 * callback with `token_hash` and `type`, see `supabase/templates`). A link already used or
 * expired is refused by the provider (EF-6, CA-3).
 */
export async function verifyMagicLink(
  client: EmailAuthClient,
  tokenHash: string,
  type: CallbackType,
): Promise<SessionSnapshot> {
  return sessionOf(await client.verifyOtp({ token_hash: tokenHash, type }));
}

/** Exchanges the PKCE code of a universal link (EF-6) for the session of the account. */
export async function exchangeMagicCode(
  client: EmailAuthClient,
  code: string,
): Promise<SessionSnapshot> {
  return sessionOf(await client.exchangeCodeForSession(code));
}
