import type { NextRequest } from 'next/server';

import { CallbackQuery } from '@learny/contracts';
import { clock } from '@learny/core';
import { createLogger } from '@learny/core/server';
import {
  INVALID_LINK_DESTINATION,
  completeVerification,
  createServiceContext,
} from '@learny/services';

import { resolveApiRequestId } from '../../../../../lib/api/request-id';
import {
  NEXT_COOKIE,
  appUrl,
  createAuthClient,
  expireCookie,
  readCookies,
} from '../../../../../lib/supabase/server';

export const dynamic = 'force-dynamic';

// Native route (not `handler()`): it answers with a redirect (SPEC-202 EF-6). It reuses the request
// id and the structured log. Any failure leads to the invalid-link page (CL-1, CL-2).
export async function GET(request: NextRequest): Promise<Response> {
  const requestId = resolveApiRequestId(request.headers.get('x-request-id'));
  const logger = createLogger({ route: 'auth.callback', requestId, clock });
  const responseHeaders = new Headers();
  const base = appUrl(request);

  const query = CallbackQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  let destination = INVALID_LINK_DESTINATION;
  if (query.success) {
    const ctx = createServiceContext({ userId: null, requestId, logger, clock });
    const cookieNext = readCookies(request).find((cookie) => cookie.name === NEXT_COOKIE)?.value;
    destination = await completeVerification(
      ctx,
      {
        tokenHash: query.data.token_hash,
        type: query.data.type,
        next: query.data.next ?? cookieNext,
      },
      { auth: createAuthClient(request, responseHeaders), appUrl: base },
    );
    expireCookie(request, responseHeaders, NEXT_COOKIE);
  }

  logger.info('callback completed', {
    method: 'GET',
    status: 302,
    outcome: destination === INVALID_LINK_DESTINATION ? 'invalid-link' : 'verified',
  });
  // Relative `Location`: the browser resolves it against the origin it used (host, port, proxy),
  // so the session cookies it just received are sent back to the same origin.
  const response = new Response(null, { status: 302, headers: { location: destination } });
  response.headers.set('cache-control', 'no-store');
  response.headers.set('x-request-id', requestId);
  for (const cookie of responseHeaders.getSetCookie())
    response.headers.append('set-cookie', cookie);
  return response;
}
