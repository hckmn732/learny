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
    // `getUser` is the verified read; when the auth service is temporarily unreachable, the local
    // session keeps the shell of a signed-in learner. Display only: every data read still goes
    // through RLS with this token, which the API validates on each call.
    const verified = await supabase.auth.getUser();
    const verifiedUser = (verified.error === null ? verified.data.user : null) as {
      id: string;
    } | null;
    const user = verifiedUser ?? (await supabase.auth.getSession()).data.session?.user ?? null;
    if (user === null) return null;
    const profile = await loadProfileRow(supabase, user.id);
    return { userId: user.id, onboardingStep: profile.onboardingStep };
  } catch {
    return null;
  }
}
