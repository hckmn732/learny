// Onboarding gate (SPEC-3102 BR-ACC-04; QA hot fix 2026-11-25): « Terminez votre configuration
// sur le web ».
//
// « Continuer sur le web » opens the web configuration signed in with the session of the app; the
// end of the web onboarding closes the browser, and the state is re-read automatically (browser
// closed, application back in the foreground, light polling while the screen is shown).
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { OnboardingGateScreen } from '../src/features/shell/OnboardingGateScreen';
import { useOnboarding } from '../src/features/shell/use-shell';
import { openOnboardingOnWeb } from '../src/features/shell/web-handoff';

/** Web page of the current onboarding step (BR-ACC-04: `/premiers-pas/<étape>`). */
export function onboardingWebPath(step: string | null): string {
  return `/premiers-pas/${step === null || step === 'done' ? 'profil' : step}`;
}

const POLL_MS = 5000;

export default function TerminerSurLeWebRoute() {
  const router = useRouter();
  const onboarding = useOnboarding();
  const [opening, setOpening] = useState(false);
  const left = useRef(false);

  const check = useCallback(async () => {
    if (left.current) return;
    try {
      if (await onboarding.refresh()) {
        left.current = true;
        router.replace('/(app)/aujourdhui');
      }
    } catch {
      // A failed check is retried by the next trigger.
    }
  }, [onboarding, router]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void check();
    });
    const timer = setInterval(() => {
      if (AppState.currentState === 'active') void check();
    }, POLL_MS);
    return () => {
      subscription.remove();
      clearInterval(timer);
    };
  }, [check]);

  return (
    <OnboardingGateScreen
      busy={opening}
      onContinue={() => {
        if (opening) return;
        setOpening(true);
        void openOnboardingOnWeb(onboardingWebPath(onboarding.step))
          .catch(() => undefined)
          .finally(() => {
            setOpening(false);
            void check();
          });
      }}
    />
  );
}
