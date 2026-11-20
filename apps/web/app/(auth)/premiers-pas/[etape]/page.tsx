import { notFound, redirect } from 'next/navigation';

import { BYOK_RECOMMENDED_MODELS, parsePublicEnv } from '@learny/config';

import { AiStep } from '../../../../components/onboarding/AiStep';
import { DepartureStep } from '../../../../components/onboarding/DepartureStep';
import { ProfileStep } from '../../../../components/onboarding/ProfileStep';
import { RemindersStep } from '../../../../components/onboarding/RemindersStep';
import { RhythmStep } from '../../../../components/onboarding/RhythmStep';
import { isApiError, serverApi } from '../../../../lib/api/server-client';
import { readPageSession } from '../../../../lib/supabase/page';

const STEPS = ['profil', 'rythme', 'ia', 'rappels', 'depart'] as const;
type Step = (typeof STEPS)[number];

const RANK: Record<Step | 'done', number> = {
  profil: 0,
  rythme: 1,
  ia: 2,
  rappels: 3,
  depart: 4,
  done: 5,
};

export const dynamic = 'force-dynamic';

function isStep(value: string): value is Step {
  return (STEPS as readonly string[]).includes(value);
}

/** SPEC-602 EF-1 to EF-14 — one Server Component per step, state read under RLS. */
export default async function OnboardingStepPage({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ etape: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { etape } = await params;
  if (!isStep(etape)) notFound();
  const session = await readPageSession();
  if (session === null) {
    redirect(`/connexion?suite=${encodeURIComponent(`/premiers-pas/${etape}`)}`);
  }
  const client = await serverApi();
  let state;
  try {
    state = await client.api.meOnboardingGet({});
  } catch (error) {
    if (isApiError(error, 'UNAUTHENTICATED')) {
      redirect(`/connexion?suite=${encodeURIComponent(`/premiers-pas/${etape}`)}`);
    }
    throw error;
  }
  const stored = state.profile.onboardingStep;
  if (stored !== 'done' && RANK[etape] > RANK[stored]) {
    redirect(`/premiers-pas/${stored}`);
  }
  const { profile, preferences, reminders, needsCheckout } = state;
  const query = await searchParams;
  const payment =
    query.abonnement === 'ok' ? 'ok' : query.abonnement === 'annule' ? 'annule' : undefined;

  switch (etape) {
    case 'profil':
      return (
        <ProfileStep
          courseLanguage={profile.courseLanguage}
          firstName={profile.firstName}
          timezone={profile.timezone}
          tutorTone={profile.tutorTone}
        />
      );
    case 'rythme':
      return <RhythmStep initial={preferences} />;
    case 'ia':
      return <AiStep recommendedModels={BYOK_RECOMMENDED_MODELS} />;
    case 'rappels':
      return (
        <RemindersStep
          initial={reminders}
          needsCheckout={needsCheckout}
          publicKey={parsePublicEnv(process.env).NEXT_PUBLIC_VAPID_PUBLIC_KEY}
        />
      );
    case 'depart':
      return (
        <DepartureStep
          firstName={profile.firstName ?? 'Alex'}
          payment={payment}
          tutorTone={profile.tutorTone}
        />
      );
  }
}
