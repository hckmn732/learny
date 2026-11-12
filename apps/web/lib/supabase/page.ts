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
  try {
    const { url, key } = supabaseConfig();
    const jar = await cookies();
    const supabase = createServerClient(url, key, {
      cookies: {
        getAll: () => jar.getAll().map(({ name, value }) => ({ name, value })),
        setAll: () => undefined,
      },
    });
    const { data, error } = await supabase.auth.getUser();
    if (error !== null) return null;
    const profile = await loadProfileRow(supabase, data.user.id);
    return { userId: data.user.id, onboardingStep: profile.onboardingStep };
  } catch {
    return null;
  }
}
