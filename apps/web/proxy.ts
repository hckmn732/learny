// Page proxy of apps/web (Next 16 name of the middleware).
//
// 1. Simulated Stripe pages (SPEC-210 EF-7, ADR-2041): a network-level guard. The root
//    loading.tsx makes pages stream, and a streamed page can no longer change its status: the 404
//    is decided here, before rendering. The pages keep their own guard as a second line of defense.
// 2. Formation pages (SPEC-615 ET-1, CL-1): the same streaming constraint applies to a formation
//    of another learner. A fast access read decides the 404 before the loading skeleton starts; the
//    page service repeats the check under RLS as the second line of defense.
// 3. Authentication and onboarding (SPEC-202, EF-9, ET-6): refresh the Supabase session, send an
//    anonymous visitor of a protected page to `/connexion`, a signed-in one away from the sign-in
//    pages, and a learner who has not finished the first steps to `/premiers-pas/<step>`.
import { NextResponse, type NextRequest } from 'next/server';

import { ApiError } from '@learny/api-client';
import { clock } from '@learny/core';

import { relayToApi } from './lib/api/relay';
import { serverApi } from './lib/api/server-client';
import {
  ONBOARDING_TICKET_TTL_MS,
  createOnboardingTicket,
  readOnboardingTicket,
} from './lib/onboarding-ticket';
import { decideRoute, isApiPath } from './lib/route-guard';
import { sddPagesEnabled } from './lib/sdd-pages';
import { buildContentSecurityPolicy, createCspNonce } from './lib/security/csp';
import {
  applySecurityHeaders,
  isHttpsRequest,
  isProductionEnvironment,
} from './lib/security/headers';
import { refreshSession } from './lib/supabase/middleware';
import { ONBOARDED_COOKIE, expireCookie } from './lib/supabase/server';

// Unmatched internal path: rendered by app/not-found.tsx with a real 404 status.
const NOT_FOUND_PATH = '/_sdd-not-found';
const TICKET_TTL_SECONDS = Math.ceil(ONBOARDING_TICKET_TTL_MS / 1000);
const FORMATION_PATH = /^\/formations\/([^/]+)(?:\/|$)/;

function sddGuard(request: NextRequest, requestHeaders: Headers): NextResponse {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  // SPEC-210 EF-7 — the simulated Stripe pages: /_dev/stripe/checkout and /_dev/stripe/portal are
  // the only pages left under /_dev (the demonstration pages and galleries are retired, ADR-2041).
  const stripePage =
    segments[1] === 'stripe' &&
    segments.length === 3 &&
    (segments[2] === 'checkout' || segments[2] === 'portal');
  const allowed = sddPagesEnabled(process.env) && stripePage;
  if (allowed) return NextResponse.next({ request: { headers: requestHeaders } });
  return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), {
    status: 404,
    request: { headers: requestHeaders },
  });
}

/**
 * ET-1, CL-1 — a formation page of another learner must answer a real 404. The root loading page
 * already streamed the skeleton, so the status has to be fixed before rendering. The read is a
 * single indexed visibility check, not the page content.
 */
async function formationGuard(
  request: NextRequest,
  requestHeaders: Headers,
): Promise<NextResponse | null> {
  const match = FORMATION_PATH.exec(request.nextUrl.pathname);
  if (match === null) return null;
  const formationId = match[1] ?? '';
  // `/formations/nouvelle` is not a formation id; the page keeps its own validation.
  if (formationId === 'nouvelle') return null;
  try {
    const client = await serverApi(request.headers);
    await client.api.formationAccessGet({ params: { fid: formationId } });
    return null;
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 404) return null;
  }
  return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), {
    status: 404,
    request: { headers: requestHeaders },
  });
}

async function sessionGuard(request: NextRequest, requestHeaders: Headers): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  let session;
  try {
    session = await refreshSession(request);
  } catch {
    // Auth not configured or unreachable: public pages keep working, protected ones ask to sign in.
    if (isApiPath(pathname)) {
      return NextResponse.next({ request: { headers: requestHeaders } });
    }
    session = {
      userId: null,
      writes: [],
      loadProfile: () => Promise.reject(new Error('no session')),
    };
  }

  const now = clock.now();
  const ticketValue = request.cookies.get(ONBOARDED_COOKIE)?.value;
  const ticket =
    session.userId === null || ticketValue === undefined
      ? null
      : readOnboardingTicket(ticketValue, { userId: session.userId, now });
  const decision = await decideRoute(
    {
      pathname,
      search,
      userId: session.userId,
      cachedStep: ticket?.step,
    },
    session.loadProfile,
  );

  let response =
    decision.kind === 'redirect'
      ? NextResponse.redirect(new URL(decision.to, request.url), 307)
      : NextResponse.next({ request: { headers: requestHeaders } });
  if (decision.kind !== 'redirect' && session.userId !== null) {
    const denied = await formationGuard(request, requestHeaders);
    if (denied !== null) response = denied;
  }
  for (const write of session.writes) response.cookies.set(write.name, write.value, write.options);
  if (session.userId !== null && decision.cacheStep !== undefined) {
    const value = createOnboardingTicket({
      userId: session.userId,
      step: decision.cacheStep,
      now,
    });
    if (value !== null) {
      response.cookies.set(ONBOARDED_COOKIE, value, {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure:
          new URL(request.url).hostname !== 'localhost' &&
          new URL(request.url).hostname !== '127.0.0.1',
        maxAge: TICKET_TTL_SECONDS,
      });
    }
  }
  if (session.userId === null && ticketValue !== undefined) {
    // A ticket that outlived its session must not grant anything to the next account.
    const headers = new Headers();
    expireCookie(request, headers, ONBOARDED_COOKIE);
    for (const line of headers.getSetCookie()) response.headers.append('set-cookie', line);
  }
  return response;
}

function securityOptions(request: NextRequest, nonce: string) {
  return {
    nonce,
    production: isProductionEnvironment(),
    https: isHttpsRequest(request),
    csp: {
      ...(process.env.NEXT_PUBLIC_SUPABASE_URL === undefined
        ? {}
        : { supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL }),
      ...(process.env.NEXT_PUBLIC_SENTRY_DSN === undefined
        ? {}
        : { sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN }),
    },
  };
}

/**
 * SPEC-805 EF-1/EF-2 — one random nonce per request, reused by every script of the response, and
 * the static headers. The nonce is sent to Next through both `x-nonce` and the request CSP header
 * so its own scripts are stamped before the document is rendered.
 */
export function proxy(request: NextRequest): NextResponse | Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/api/') || pathname === '/openapi.json') {
    return relayToApi(request);
  }
  const nonce = createCspNonce();
  const options = securityOptions(request, nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('content-security-policy', buildContentSecurityPolicy(nonce, options.csp));
  if (pathname === '/_dev' || pathname.startsWith('/_dev/')) {
    return applySecurityHeaders(sddGuard(request, requestHeaders), options);
  }
  return sessionGuard(request, requestHeaders).then((response) =>
    applySecurityHeaders(response, options),
  );
}

export const config = {
  matcher: [
    '/_dev',
    '/_dev/:path*',
    '/api/:path*',
    '/openapi.json',
    // Everything else except static assets and files with an extension.
    '/((?!_dev|_next|.*\\..*|api).*)',
  ],
};
