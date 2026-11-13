// Page proxy of apps/web (Next 16 name of the middleware).
//
// 1. SDD demonstration pages (SPEC-006, EF-3): a network-level guard. The root loading.tsx makes
//    pages stream, and a streamed page can no longer change its status: the 404 is decided here,
//    before rendering. The pages keep their own guard as a second line of defense.
// 2. Formation pages (SPEC-615 ET-1, CL-1): the same streaming constraint applies to a formation
//    of another learner. A fast access read decides the 404 before the loading skeleton starts; the
//    page service repeats the check under RLS as the second line of defense.
// 3. Authentication and onboarding (SPEC-202, EF-9, ET-6): refresh the Supabase session, send an
//    anonymous visitor of a protected page to `/connexion`, a signed-in one away from the sign-in
//    pages, and a learner who has not finished the first steps to `/premiers-pas/<step>`.
import { randomUUID } from 'node:crypto';

import { NextResponse, type NextRequest } from 'next/server';

import { clock } from '@learny/core';
import { canAccessFormation, createServiceContext } from '@learny/services';

import { sddDemos } from './app/%5Fdev/sdd/registry';
import {
  ONBOARDING_TICKET_TTL_MS,
  createOnboardingTicket,
  readOnboardingTicket,
} from './lib/onboarding-ticket';
import { decideRoute, isApiPath } from './lib/route-guard';
import { findSddDemo, sddPagesEnabled } from './lib/sdd-pages';
import { refreshSession } from './lib/supabase/middleware';
import { ONBOARDED_COOKIE, expireCookie } from './lib/supabase/server';

// Unmatched internal path: rendered by app/not-found.tsx with a real 404 status.
const NOT_FOUND_PATH = '/_sdd-not-found';
const TICKET_TTL_SECONDS = Math.ceil(ONBOARDING_TICKET_TTL_MS / 1000);
const FORMATION_PATH = /^\/formations\/([^/]+)(?:\/|$)/;

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

/**
 * ET-1, CL-1 — a formation page of another learner must answer a real 404. The root loading page
 * already streamed the skeleton, so the status has to be fixed before rendering. The read is a
 * single indexed visibility check, not the page content.
 */
async function formationGuard(request: NextRequest, userId: string): Promise<NextResponse | null> {
  const match = FORMATION_PATH.exec(request.nextUrl.pathname);
  if (match === null) return null;
  const formationId = match[1] ?? '';
  // `/formations/nouvelle` is not a formation id; the page keeps its own validation.
  if (formationId === 'nouvelle') return null;
  try {
    const ctx = createServiceContext({ userId, requestId: randomUUID() });
    const access = await canAccessFormation(ctx, formationId);
    if (access.ok && access.value) return null;
    // A transient read failure lets the page show its controlled error state.
    if (!access.ok && access.error.code !== 'NOT_FOUND') return null;
  } catch {
    return null;
  }
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
      : NextResponse.next();
  if (decision.kind !== 'redirect' && session.userId !== null) {
    const denied = await formationGuard(request, session.userId);
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
    '/((?!_dev|_next|.*\\..*|api/inngest|api/v1/webhooks).*)',
  ],
};
