// Provider sign-in surface of the mobile application (SPEC-3402 EF-1 to EF-3, ET-1; ADR-3008 § 7,
// ADR-3011).
//
// Every provider — Apple native, Apple web flow of Android, Google native and the simulated
// provider of the e2e builds — answers the same small shape, so the screen never branches on a
// platform or on a native module. A provider never returns a session token in clear: either it
// carries an identity token that Supabase exchanges, or it already opened the session itself.
export type ProviderId = 'apple' | 'google';

/** Name announced by the provider at the first authorisation (EF-2, BR-PLA-05). */
export interface ProviderName {
  readonly firstName: string;
  readonly lastName: string | null;
}

export type ProviderResult =
  | { readonly status: 'cancelled' }
  | {
      readonly status: 'idToken';
      readonly idToken: string;
      /** Raw nonce (Apple only); Supabase receives it next to the identity token (EF-2). */
      readonly nonce: string | null;
      readonly name: ProviderName | null;
    }
  | { readonly status: 'session'; readonly name: ProviderName | null };

export interface ProviderAdapter {
  readonly id: ProviderId;
  /** False hides the provider — and Google with it (ADR-3006 § 3, CA-1). */
  isAvailable(): Promise<boolean>;
  signIn(): Promise<ProviderResult>;
}

/** Name of the profile, or `null` when the provider announced nothing usable (CL-3). */
export function providerName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
): ProviderName | null {
  const given = (firstName ?? '').trim();
  const family = (lastName ?? '').trim();
  if (given === '') return null;
  return { firstName: given, lastName: family === '' ? null : family };
}
