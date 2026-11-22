// Guard of the authentication (SPEC-3101 EF-7, BR-ACC-09; ADR-3008).
//
// Mounted once under the session provider by `app/_layout.tsx`. It only protects the `(app)`
// group: the `(auth)` screens stay reachable while signed out, the callback route is never
// redirected (a link must be able to open a session, CL-4), and the demonstration pages
// (`/_dev/**`) of the test builds are deliberately out of the guard.
import { useRouter, useSegments, type Href } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '../../auth/session';

const SIGN_IN: Href = '/(auth)/connexion';
const SHELL: Href = '/(app)/aujourdhui';

/** Redirects to the sign-in screen when signed out inside the shell, and back once signed in. */
export function AuthGate(): null {
  const { status } = useSession();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;
    const group = segments[0];
    if (status === 'signedOut' && group === '(app)') router.replace(SIGN_IN);
    if (status === 'signedIn' && group === '(auth)') router.replace(SHELL);
  }, [router, segments, status]);

  return null;
}
