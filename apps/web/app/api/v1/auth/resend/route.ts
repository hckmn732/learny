import { authResend } from '@learny/contracts';
import { resendLink } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';
import { appUrl, createAuthClient } from '../../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

export const POST = handler(authResend, ({ ctx, body }) =>
  resendLink(ctx, body, {
    auth: createAuthClient(ctx.request, ctx.responseHeaders),
    appUrl: appUrl(ctx.request),
  }),
);
