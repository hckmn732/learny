import { redirect } from 'next/navigation';

import { serverApi } from '../../../lib/api/server-client';
import { readPageSession } from '../../../lib/supabase/page';

export const dynamic = 'force-dynamic';

/** SPEC-602 EF-1 — `/premiers-pas` opens the stored step, or the home when onboarding is done. */
export default async function OnboardingIndexPage() {
  const session = await readPageSession();
  if (session === null) redirect('/connexion?suite=%2Fpremiers-pas');
  try {
    const client = await serverApi();
    const profile = await client.api.meGet({});
    if (profile.onboardingStep === 'done') redirect('/accueil');
    redirect(`/premiers-pas/${profile.onboardingStep}`);
  } catch {
    redirect('/connexion?suite=%2Fpremiers-pas');
  }
}
