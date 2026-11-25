// Opens the web configuration with the session of the application (QA hot fix, 2026-11-25).
//
// `POST /auth/web-handoff` (Bearer) answers a single-use link of the web callback for the signed-in
// account; it opens the web session in an authentication browser that closes by itself when the
// web onboarding ends on `learny://onboarding-termine`.
import * as WebBrowser from 'expo-web-browser';
import { z } from 'zod';

import { requireApiClient } from '../../api/registry';
import { openOnWeb, webBaseUrl } from '../../lib/web';

/** Deep link the end of the web onboarding navigates to (closes the browser). */
export const ONBOARDING_RETURN_URL = 'learny://onboarding-termine';

const HandoffResult = z.object({ url: z.url() });

/** Opens the web onboarding signed in; falls back to the plain page if the link cannot be made. */
export async function openOnboardingOnWeb(fallbackPath: string): Promise<void> {
  let url: string | null = null;
  try {
    const result = await requireApiClient().apiFetch({
      method: 'POST',
      path: '/auth/web-handoff',
      body: {},
      output: HandoffResult,
    });
    // Only a link of our own web application is ever opened.
    if (result.url.startsWith(`${webBaseUrl()}/`)) url = result.url;
  } catch {
    url = null;
  }
  if (url === null) {
    await openOnWeb(fallbackPath);
    return;
  }
  await WebBrowser.openAuthSessionAsync(url, ONBOARDING_RETURN_URL);
}
