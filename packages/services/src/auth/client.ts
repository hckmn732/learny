// Port of the Supabase Auth client used by the authentication services (SPEC-202 ET-3, ET-4).
// The web application builds it from the request cookies; tests can pass a fake.
import type { SupabaseClient } from '@supabase/supabase-js';

export type AuthClient = Pick<
  SupabaseClient['auth'],
  'signInWithOtp' | 'signUp' | 'signInWithPassword' | 'resend' | 'verifyOtp' | 'signOut' | 'getUser'
>;

export interface AuthDeps {
  auth: AuthClient;
  /** Public origin of the application, e.g. `http://localhost:3000`. */
  appUrl: string;
}

export type SignupMethod = 'magic_link' | 'password';

export interface SignupMetadata {
  termsAcceptedAt: string;
  cguVersion: string;
  privacyVersion: string;
  timezone?: string;
  method: SignupMethod;
}

export function callbackUrl(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, '')}/api/v1/auth/callback`;
}
