import { authSignOut } from '@learny/contracts';
import { signOut } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';
import {
  NEXT_COOKIE,
  ONBOARDED_COOKIE,
  appUrl,
  createAuthClient,
  expireCookie,
} from '../../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

// Idempotent: without a session the answer is still 204 (SPEC-202 EF-7, CL-10).
export const POST = handler(authSignOut, async ({ ctx }) => {
  const auth = createAuthClient(ctx.request, ctx.responseHeaders);
  try {
    await signOut({ auth, appUrl: appUrl(ctx.request) });
  } catch {
    ctx.logger.warn('sign-out without a valid session', { outcome: 'ignored' });
  }
  expireCookie(ctx.request, ctx.responseHeaders, ONBOARDED_COOKIE);
  expireCookie(ctx.request, ctx.responseHeaders, NEXT_COOKIE);
  return undefined;
});
