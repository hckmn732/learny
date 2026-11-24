// Guard of the authentication (SPEC-3101 EF-7, BR-ACC-09; ADR-3008).
//
// Mounted once under the session provider by `app/_layout.tsx`. It only protects the `(app)`
// group: the `(auth)` screens stay reachable while signed out, the callback route is never
// redirected (a link must be able to open a session, CL-4), and the demonstration pages
// (`/_dev/**`) of the test builds are deliberately out of the guard.
//
// SPEC-3402 CA-2 — a provider connection opens its session before the learner accepted the legal
// documents. `useProviderSignIn` holds this gate until the acceptance is recorded; the effect is
// replayed when the hold is released, so the shell opens exactly once.
import { useRouter, useSegments, type Href } from 'expo-router';
import { useEffect } from 'react';

import { useNavigationHold } from '../../auth/navigation-hold';
import { useSession } from '../../auth/session';

const SIGN_IN: Href = '/(auth)/connexion';
/** Routes outside the `(app)` group that still require an open session (SPEC-3102 EF-4). */
const PROTECTED_SEGMENTS: readonly string[] = ['(app)', 'terminer-sur-le-web'];
const SHELL: Href = '/(app)/aujourdhui';

/** Redirects to the sign-in screen when signed out inside the shell, and back once signed in. */
export function AuthGate(): null {
  const { status } = useSession();
  const held = useNavigationHold();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading' || held) return;
    const group = segments[0];
    if (status === 'signedOut' && PROTECTED_SEGMENTS.some((segment) => segment === group)) {
      router.replace(SIGN_IN);
    }
    if (status === 'signedIn' && group === '(auth)') router.replace(SHELL);
  }, [held, router, segments, status]);

  return null;
}
