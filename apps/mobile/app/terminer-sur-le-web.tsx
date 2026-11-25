// Onboarding gate (SPEC-3102 BR-ACC-04; QA hot fix 2026-11-25; quickfix « rattrapage mobile »).
//
// The gate no longer opens the web configuration: its action opens the native first steps
// (`/premiers-pas/1`, route of the quickfix « rattrapage mobile »). The route keeps re-reading the
// onboarding state when the application comes back to the foreground (CL-4): the end of the
// configuration, native or web, opens the shell.
//
// TODO(quickfix) — l'écran web de secours reste disponible (`onboardingWebPath` ci-dessous et
// `openOnboardingOnWeb` de `src/features/shell/web-handoff.ts`) pour une étape que les premiers pas
// natifs ne couvriraient pas ; il n'est plus branché.
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { OnboardingGateScreen } from '../src/features/shell/OnboardingGateScreen';
import { useOnboarding } from '../src/features/shell/use-shell';

/** Web page of the current onboarding step (fallback, no longer wired — TODO(quickfix)). */
export function onboardingWebPath(step: string | null): string {
  return `/premiers-pas/${step === null || step === 'done' ? 'profil' : step}`;
}

const POLL_MS = 5000;

export default function TerminerSurLeWebRoute() {
  const router = useRouter();
  const onboarding = useOnboarding();
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

  return <OnboardingGateScreen />;
}
