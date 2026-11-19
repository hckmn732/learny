import { authMagicLink, authResend, authSignIn, authSignOut, authSignUp } from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  isSafeNextPath,
  requestMagicLink,
  resendLink,
  signInWithPassword,
  signOut,
  signUpWithPassword,
} from '@learny/services';

import {
  NEXT_COOKIE,
  ONBOARDED_COOKIE,
  appUrl,
  appendCookie,
  createAuthClient,
  expireCookie,
} from '../deps/supabase-server';

// SPEC-1004 ET-1 - implementations of the `auth` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const authImplementations = {
  authMagicLink: async ({ ctx, body }: HandlerArgs<typeof authMagicLink>) => {
    const auth = createAuthClient(ctx.request, ctx.responseHeaders);
    const result = await requestMagicLink(ctx, body, { auth, appUrl: appUrl(ctx.request) });
    // The e-mailed link cannot carry `next` (fixed template): it travels in a short-lived cookie.
    if (result.ok && body.mode === 'sign-in' && isSafeNextPath(body.next)) {
      appendCookie(ctx.request, ctx.responseHeaders, NEXT_COOKIE, body.next, { maxAge: 3600 });
    }
    return result;
  },
  authResend: ({ ctx, body }: HandlerArgs<typeof authResend>) =>
    resendLink(ctx, body, {
      auth: createAuthClient(ctx.request, ctx.responseHeaders),
      appUrl: appUrl(ctx.request),
    }),
  authSignIn: ({ ctx, body }: HandlerArgs<typeof authSignIn>) =>
    signInWithPassword(ctx, body, {
      auth: createAuthClient(ctx.request, ctx.responseHeaders),
      appUrl: appUrl(ctx.request),
    }),
  authSignOut: async ({ ctx }: HandlerArgs<typeof authSignOut>) => {
    const auth = createAuthClient(ctx.request, ctx.responseHeaders);
    try {
      await signOut({ auth, appUrl: appUrl(ctx.request) });
    } catch {
      ctx.logger.warn('sign-out without a valid session', { outcome: 'ignored' });
    }
    expireCookie(ctx.request, ctx.responseHeaders, ONBOARDED_COOKIE);
    expireCookie(ctx.request, ctx.responseHeaders, NEXT_COOKIE);
    return undefined;
  },
  authSignUp: ({ ctx, body }: HandlerArgs<typeof authSignUp>) =>
    signUpWithPassword(ctx, body, {
      auth: createAuthClient(ctx.request, ctx.responseHeaders),
      appUrl: appUrl(ctx.request),
    }),
};
