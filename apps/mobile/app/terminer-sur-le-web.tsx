// Onboarding gate (SPEC-3102 BR-ACC-04, CA-3, CL-4): « Terminez votre configuration sur le web ».
//
// The only screen a learner whose configuration is unfinished can reach (the guard of the
// connected group redirects here). « J'ai terminé » re-reads the server and opens the shell as
// soon as it answers `done`, without restarting the application.
import { useRouter } from 'expo-router';

import { OnboardingGateScreen } from '../src/features/shell/OnboardingGateScreen';
import { useOnboarding } from '../src/features/shell/use-shell';
import { openOnWeb } from '../src/lib/web';

/** Web page of the current onboarding step (BR-ACC-04: `/premiers-pas/<étape>`). */
export function onboardingWebPath(step: string | null): string {
  return `/premiers-pas/${step === null || step === 'done' ? 'profil' : step}`;
}

export default function TerminerSurLeWebRoute() {
  const router = useRouter();
  const onboarding = useOnboarding();

  return (
    <OnboardingGateScreen
      onContinue={() => {
        void openOnWeb(onboardingWebPath(onboarding.step));
      }}
      onDone={async () => {
        const done = await onboarding.refresh();
        if (done) router.replace('/(app)/aujourdhui');
        return done;
      }}
      busy={onboarding.status === 'loading'}
    />
  );
}
