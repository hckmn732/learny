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

/** Return link of the web onboarding: it only closes the browser, it is never followed. */
const ONBOARDING_RETURN_PATH = '/onboarding-termine';

/**
 * Last link followed by the shell. `useLinkingURL` keeps answering the same URL, and the shell is
 * remounted by the navigation it triggers: following it again would loop forever.
 */
let lastFollowedUrl: string | null = null;

/** Follows an internal link once the session is open. */
export function useDeepLinkNavigation(): void {
  const url = Linking.useLinkingURL();
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (url === null || status !== 'signedIn' || url === lastFollowedUrl) return;
    const link = resolveDeepLink(url, webBaseUrl());
    if (link === null || isAuthPath(link.path) || link.path.startsWith(ONBOARDING_RETURN_PATH)) {
      return;
    }
    lastFollowedUrl = url;
    router.replace(link.path);
  }, [router, status, url]);
}
