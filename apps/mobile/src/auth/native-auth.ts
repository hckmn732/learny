// Supabase client seen through the narrow authentication surface (SPEC-3101 ET-1).
//
// Kept apart from `email-auth.ts` on purpose: the rules of the magic link are tested in Node
// (Vitest) with an injected client, while this module — the only one that touches the native
// Auth client — is mocked by the component tests.
import type { EmailAuthClient } from './email-auth';
import { supabase } from './supabase';

/** Client of the process, reduced to the calls of `email-auth.ts`. */
export function emailAuthClient(): EmailAuthClient {
  return supabase().auth;
}
