// Session refresh and profile lookup for the page proxy (SPEC-202 ET-3, ET-6). Cookies written by
// the Auth client during a refresh are returned so the proxy can copy them onto the answer.
import { createServerClient } from '@supabase/ssr';
import type { NextRequest } from 'next/server';

import type { DestinationProfile } from '@learny/services/destination';

import { loadProfileRow } from './profile';
import { sessionCookieOptions, supabaseConfig } from './server';

export interface CookieWrite {
  name: string;
  value: string;
  options: ReturnType<typeof sessionCookieOptions>;
}

export interface RefreshedSession {
  userId: string | null;
  writes: CookieWrite[];
  loadProfile: () => Promise<DestinationProfile>;
}

export async function refreshSession(request: NextRequest): Promise<RefreshedSession> {
  const { url, key } = supabaseConfig();
  const writes: CookieWrite[] = [];
  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll().map(({ name, value }) => ({ name, value })),
      setAll: (cookies) => {
        for (const { name, value, options } of cookies) {
          if (name.endsWith('-code-verifier')) continue;
          writes.push({ name, value, options: sessionCookieOptions(request, options) });
        }
      },
    },
  });
  const { data, error } = await supabase.auth.getUser();
  const userId = error === null ? data.user.id : null;

  return {
    userId,
    writes,
    loadProfile: () => loadProfileRow(supabase, userId ?? ''),
  };
}
