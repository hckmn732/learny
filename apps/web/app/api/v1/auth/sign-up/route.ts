import { authSignUp } from '@learny/contracts';
import { signUpWithPassword } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';
import { appUrl, createAuthClient } from '../../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export const POST = handler(authSignUp, ({ ctx, body }) =>
  signUpWithPassword(ctx, body, {
    auth: createAuthClient(ctx.request, ctx.responseHeaders),
    appUrl: appUrl(ctx.request),
  }),
);
