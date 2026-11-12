import { authSignIn } from '@learny/contracts';
import { signInWithPassword } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';
import { appUrl, createAuthClient } from '../../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export const POST = handler(authSignIn, ({ ctx, body }) =>
  signInWithPassword(ctx, body, {
    auth: createAuthClient(ctx.request, ctx.responseHeaders),
    appUrl: appUrl(ctx.request),
  }),
);
