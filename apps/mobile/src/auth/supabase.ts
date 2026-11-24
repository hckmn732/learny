// Supabase client of the mobile application (SPEC-3003 EF-1; ADR-3008 § 1 et § 2).
//
// The mobile client talks to Supabase Auth directly (never to a new `/auth/*` route of the API),
// with the session kept by `secureSessionStorage`: MMKV encrypted with a key of the keychain, so
// nothing is ever written in clear (ET-1, CA-5).
import { createClient } from '@supabase/supabase-js';

import { configResult } from '../config';

import { secureSessionStorage } from './secure-backend';
import type { SecureSessionStorage } from './secure-storage';

export interface SupabaseClientOptions {
  readonly url: string;
  readonly anonKey: string;
  readonly storage: SecureSessionStorage;
}

/** Type of the Auth client of the application (inferred, so no generic is repeated here). */
export type AppSupabaseClient = ReturnType<typeof createSupabaseAuthClient>;

/** Builds the Auth client (EF-1); exported so the tests can inject their own storage. */
export function createSupabaseAuthClient(options: SupabaseClientOptions) {
  return createClient(options.url, options.anonKey, {
    auth: {
      storage: options.storage,
      autoRefreshToken: true,
      persistSession: true,
      // A native application never receives the session in the URL (ADR-3008 § 4).
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
}

let cached: AppSupabaseClient | null = null;

/** Client of the process; throws only when the build has no Supabase configuration (CL-2). */
export function supabase(): AppSupabaseClient {
  if (cached !== null) return cached;
  if (!configResult.ok) {
    throw new Error('Configuration Supabase absente : voir l’écran « Configuration invalide ».');
  }
  cached = createSupabaseAuthClient({
    url: configResult.config.supabaseUrl,
    anonKey: configResult.config.supabaseAnonKey,
    storage: secureSessionStorage,
  });
  return cached;
}
