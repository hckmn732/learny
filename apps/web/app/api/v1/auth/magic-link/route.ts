import { authMagicLink } from '@learny/contracts';
import { isSafeNextPath, requestMagicLink } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';
import {
  NEXT_COOKIE,
  appUrl,
  appendCookie,
  createAuthClient,
} from '../../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

// Public route: sends a magic link (sign-up or sign-in). The answer never tells whether the
// address has an account (SPEC-202 EF-2, ET-8).
export const POST = handler(authMagicLink, async ({ ctx, body }) => {
  const auth = createAuthClient(ctx.request, ctx.responseHeaders);
  const result = await requestMagicLink(ctx, body, { auth, appUrl: appUrl(ctx.request) });
  // The e-mailed link cannot carry `next` (fixed template): it travels in a short-lived cookie.
  if (result.ok && body.mode === 'sign-in' && isSafeNextPath(body.next)) {
    appendCookie(ctx.request, ctx.responseHeaders, NEXT_COOKIE, body.next, { maxAge: 3600 });
  }
  return result;
});
