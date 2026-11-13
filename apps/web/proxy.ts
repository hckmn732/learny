// Page proxy of apps/web (Next 16 name of the middleware).
//
// 1. SDD demonstration pages (SPEC-006, EF-3): a network-level guard. The root loading.tsx makes
//    pages stream, and a streamed page can no longer change its status: the 404 is decided here,
//    before rendering. The pages keep their own guard as a second line of defense.
// 2. Authentication and onboarding (SPEC-202, EF-9, ET-6): refresh the Supabase session, send an
//    anonymous visitor of a protected page to `/connexion`, a signed-in one away from the sign-in
//    pages, and a learner who has not finished the first steps to `/premiers-pas/<step>`.
import { NextResponse, type NextRequest } from 'next/server';

import { sddDemos } from './app/%5Fdev/sdd/registry';
import { decideRoute, isApiPath } from './lib/route-guard';
import { findSddDemo, sddPagesEnabled } from './lib/sdd-pages';
import { refreshSession } from './lib/supabase/middleware';
import { ONBOARDED_COOKIE, expireCookie } from './lib/supabase/server';

// Unmatched internal path: rendered by app/not-found.tsx with a real 404 status.
const NOT_FOUND_PATH = '/_sdd-not-found';
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

function sddGuard(request: NextRequest): NextResponse {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const specId = segments[2];
  // SPEC-301 EF-11: the validated SDD URL answers a real 307 before the streamed root loading
  // page starts (a redirect rendered by the page would be a 200 with a client-side navigation).
  if (sddPagesEnabled(process.env) && request.nextUrl.pathname === '/_dev/sdd/SPEC-301') {
    return NextResponse.redirect(new URL('/_dev/ui/jetons', request.url), 307);
  }
  // SPEC-005 reference images live at /_dev/sdd/reference/<manifest file>; the route itself
  // checks that the file is listed in the manifest before serving it.
  const reference =
    segments.length === 4 &&
    segments[2] === 'reference' &&
    /^SCR-\d{2}-[a-z0-9-]+-(?:desktop|mobile)\.png$/.test(segments[3] ?? '');
  // SPEC-210 EF-7 — the simulated Stripe pages: /_dev/stripe/checkout and /_dev/stripe/portal.
  const stripePage =
    segments[1] === 'stripe' &&
    segments.length === 3 &&
    (segments[2] === 'checkout' || segments[2] === 'portal');
  // SPEC-301 — the design-system gallery lives under /_dev/ui (not /_dev/sdd).
  const uiGallery = segments[1] === 'ui' && segments.length <= 3;
  // SPEC-503 — the brick gallery and its four reproduction pages.
  const bricksGallery = segments[1] === 'bricks' && segments.length <= 3;
  const allowed =
    sddPagesEnabled(process.env) &&
    (stripePage ||
      uiGallery ||
      bricksGallery ||
      (segments[1] === 'sdd' &&
        (reference ||
          (segments.length <= 3 &&
            (specId === undefined ||
              // SPEC-301 redirects its validated SDD URL to the design-system gallery.
              specId === 'SPEC-301' ||
              findSddDemo(specId, sddDemos) !== undefined)))));
  if (allowed) return NextResponse.next();
  return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), { status: 404 });
}

async function sessionGuard(request: NextRequest): Promise<NextResponse> {
  const { pathname, search } = request.nextUrl;
  let session;
  try {
    session = await refreshSession(request);
  } catch {
    // Auth not configured or unreachable: public pages keep working, protected ones ask to sign in.
    if (isApiPath(pathname)) return NextResponse.next();
    session = {
      userId: null,
      writes: [],
      loadProfile: () => Promise.reject(new Error('no session')),
    };
  }

  const onboardedCookie = request.cookies.get(ONBOARDED_COOKIE)?.value;
  const decision = await decideRoute(
    { pathname, search, userId: session.userId, onboardedCookie },
    session.loadProfile,
  );

  const response =
    decision.kind === 'redirect'
      ? NextResponse.redirect(new URL(decision.to, request.url), 307)
      : NextResponse.next();
  for (const write of session.writes) response.cookies.set(write.name, write.value, write.options);
  if (decision.markOnboarded !== undefined) {
    response.cookies.set(ONBOARDED_COOKIE, decision.markOnboarded, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      secure:
        new URL(request.url).hostname !== 'localhost' &&
        new URL(request.url).hostname !== '127.0.0.1',
      maxAge: ONE_YEAR_SECONDS,
    });
  }
  if (session.userId === null && onboardedCookie !== undefined) {
    // A cookie that outlived its session must not grant anything to the next account.
    const headers = new Headers();
    expireCookie(request, headers, ONBOARDED_COOKIE);
    for (const line of headers.getSetCookie()) response.headers.append('set-cookie', line);
  }
  return response;
}

export function proxy(request: NextRequest): NextResponse | Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (pathname === '/_dev' || pathname.startsWith('/_dev/')) return sddGuard(request);
  return sessionGuard(request);
}

export const config = {
  matcher: [
    '/_dev',
    '/_dev/:path*',
    // Everything else except static assets, files with an extension, the job endpoint and webhooks.
    '/((?!_dev|_next/static|_next/image|.*\\..*|api/inngest|api/v1/webhooks).*)',
  ],
};
