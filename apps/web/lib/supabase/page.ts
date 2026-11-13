// Session of the current page render (server components of the SDD demonstrations, SPEC-202 §10).
// Read-only: cookies are refreshed by the proxy, never here.
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

import { loadProfileRow } from './profile';
import { supabaseConfig } from './server';

export interface PageSession {
  userId: string;
  onboardingStep: string;
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
    // `getUser` verifies the token with the auth service; a transient failure reads as anonymous.
    const { data, error } = await supabase.auth.getUser();
    if (error !== null) return null;
    const profile = await loadProfileRow(supabase, data.user.id);
    return { userId: data.user.id, onboardingStep: profile.onboardingStep };
  } catch {
    return null;
  }
}
