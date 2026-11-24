// Exchange of a provider result for a Supabase session, then profile and legal follow-up
// (SPEC-3402 EF-2, EF-4, EF-6, ET-1, CL-2; ADR-3008 § 5 and § 7, BR-ACC-02).
//
// The client is injected: the rules of this module are proved in Node with a fake Auth client, so
// no native Auth client ever starts in a test. `setSessionToken` publishes the token to the API
// client before the session provider's own notification, which is asynchronous.
import { authFailure } from './email-auth';
import type { ProviderId, ProviderName, ProviderResult } from './providers/types';
import { setSessionToken } from './session-token';

interface ProviderSessionData {
  readonly access_token: string;
  readonly user: { readonly id: string; readonly email?: string | null };
}

export interface ProviderAuthAnswer {
  readonly error: unknown;
  readonly data?: { readonly session?: ProviderSessionData | null } | null;
}

/** Narrow surface of Supabase Auth used here; the tests pass a fake implementation. */
export interface ProviderAuthClient {
  signInWithIdToken(params: {
    provider: ProviderId;
    token: string;
    nonce?: string;
  }): Promise<ProviderAuthAnswer>;
  getSession(): Promise<{ readonly data: { readonly session: ProviderSessionData | null } }>;
  signOut(options?: { readonly scope?: 'local' | 'global' }): Promise<unknown>;
}

export interface ProviderSession {
  readonly userId: string;
  readonly accessToken: string;
  readonly email: string | null;
}

function snapshotOf(session: ProviderSessionData | null): ProviderSession | null {
  if (session === null) return null;
  return {
    userId: session.user.id,
    accessToken: session.access_token,
    email: session.user.email ?? null,
  };
}

/** Exchanges the identity token of an Apple or Google result for the session of the account. */
export async function signInWithProviderToken(
  client: ProviderAuthClient,
  provider: ProviderId,
  result: ProviderResult,
): Promise<ProviderSession> {
  if (result.status !== 'idToken') throw new Error('Jeton d’identité attendu.');
  const params =
    result.nonce === null
      ? { provider, token: result.idToken }
      : { provider, token: result.idToken, nonce: result.nonce };
  const answer = await client.signInWithIdToken(params);
  if (answer.error !== null && answer.error !== undefined) throw authFailure(answer.error);
  const session = snapshotOf(answer.data?.session ?? null);
  if (session === null) throw new Error('Session absente après la connexion au fournisseur.');
  setSessionToken(session.accessToken);
  return session;
}

/** Session already opened by the provider itself (Apple web flow of Android, simulated provider). */
export async function currentProviderSession(client: ProviderAuthClient): Promise<ProviderSession> {
  const { data } = await client.getSession();
  const session = snapshotOf(data.session);
  if (session === null) throw new Error('Session absente après la connexion au fournisseur.');
  setSessionToken(session.accessToken);
  return session;
}

/** API surface used by the follow-up; the tests inject a recording fake. */
export interface ProviderAccessApi {
  me(): Promise<{ readonly firstName: string | null; readonly lastName: string | null }>;
  updateProfile(body: { readonly firstName?: string; readonly lastName?: string }): Promise<void>;
}

/** EF-2 — the name announced at the first connection fills the empty fields of the profile. */
export async function applyProviderName(
  api: ProviderAccessApi,
  name: ProviderName | null,
): Promise<void> {
  if (name === null) return;
  const profile = await api.me();
  const body: { firstName?: string; lastName?: string } = {};
  if (profile.firstName === null) body.firstName = name.firstName;
  if (profile.lastName === null && name.lastName !== null) body.lastName = name.lastName;
  if (body.firstName === undefined && body.lastName === undefined) return;
  await api.updateProfile(body);
}
