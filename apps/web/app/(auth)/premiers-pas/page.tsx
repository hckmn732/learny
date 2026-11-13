import { redirect } from 'next/navigation';

import { readPageSession } from '../../../lib/supabase/page';

export const dynamic = 'force-dynamic';

/** SPEC-602 EF-1 — `/premiers-pas` opens the stored step, or the home when onboarding is done. */
export default async function OnboardingIndexPage() {
  const session = await readPageSession();
  if (session === null) redirect('/connexion?suite=%2Fpremiers-pas');
  if (session.onboardingStep === 'done') redirect('/accueil');
  redirect(`/premiers-pas/${session.onboardingStep}`);
}
