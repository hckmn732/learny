// Session of the current page render (server components of the SDD demonstrations, SPEC-202 §10).
// Read-only: cookies are refreshed by the proxy, never here.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { supabaseConfig } from './server';

export interface PageSession {
  userId: string;
  onboardingStep?: string;
}

export async function readPageSession(): Promise<PageSession | null> {
  // Read the request cookies before any fallible work: the dynamic-rendering bailout must reach
  // Next.js instead of being swallowed by the catch below (a swallowed bailout would prerender
  // the anonymous variant of every page that reads the session).
  const jar = await cookies();
  try {
    const { url, key } = supabaseConfig();
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => jar.getAll().map(({ name, value }) => ({ name, value })),
        setAll: () => undefined,
      },
    });
    // The page only uses the local session as a redirect hint. The API verifies the token and
    // authorises every data read, avoiding a second Auth-server round trip per page render.
    const { data, error } = await supabase.auth.getSession();
    if (error !== null) return null;
    const userId = data.session?.user.id;
    return userId === undefined ? null : { userId };
  } catch {
    return null;
  }
}
