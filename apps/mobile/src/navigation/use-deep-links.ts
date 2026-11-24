// Deep links of the shell (SPEC-3102 EF-8).
//
// Expo Router already routes an incoming `learny://…` or universal link; this hook adds the rule
// of the specification: a link is only followed once the session is open, so a notification that
// arrives while the learner is signed out never opens a protected screen — the authentication
// guard sends them to the sign-in screen first.
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { useSession } from '../auth/session';
import { isAuthPath, resolveDeepLink } from '../lib/deep-links';
import { webBaseUrl } from '../lib/web';

/** Follows an internal link once the session is open. */
export function useDeepLinkNavigation(): void {
  const url = Linking.useLinkingURL();
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (url === null || status !== 'signedIn') return;
    const link = resolveDeepLink(url, webBaseUrl());
    if (link === null || isAuthPath(link.path)) return;
    router.replace(link.path);
  }, [router, status, url]);
}
