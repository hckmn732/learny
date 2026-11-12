// Session of the caller (SPEC-201 ET-3 step 4): Supabase cookie session read with @supabase/ssr,
// then verified by the Auth server (`auth.getUser()`), never trusted from the cookie alone.
import { createServerClient, parseCookieHeader } from '@supabase/ssr';

import { AppError } from '@learny/core';

import { getPublicEnv } from '../server-env';

export interface SessionUser {
  userId: string;
  email: string | null;
  emailConfirmed: boolean;
}

export type SessionResolver = (request: Request) => Promise<SessionUser | null>;

export const supabaseSessionResolver: SessionResolver = async (request) => {
  const env = getPublicEnv();
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url === undefined || key === undefined) {
    throw new AppError('SERVICE_UNAVAILABLE', 'Le service d’authentification n’est pas configuré.');
  }
  const cookies = parseCookieHeader(request.headers.get('cookie') ?? '').map((cookie) => ({
    name: cookie.name,
    value: cookie.value,
  }));
  if (cookies.length === 0) return null;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => cookies,
      // A route handler cannot refresh cookies: the refresh belongs to SPEC-202 (proxy).
      setAll: () => undefined,
    },
  });
  const { data, error } = await supabase.auth.getUser();
  if (error !== null) return null;
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    emailConfirmed: data.user.email_confirmed_at !== undefined,
  };
};

let resolver: SessionResolver = supabaseSessionResolver;

export function getSessionUser(request: Request): Promise<SessionUser | null> {
  return resolver(request);
}

/** Replaces the resolver (unit tests of the wrapper); returns a function restoring the default. */
export function setSessionResolver(next: SessionResolver): () => void {
  resolver = next;
  return () => {
    resolver = supabaseSessionResolver;
  };
}
