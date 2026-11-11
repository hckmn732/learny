// Network-level guard of the SDD demo pages (SPEC-006, EF-3). The root loading.tsx makes pages
// stream, and a streamed page can no longer change its status: the 404 is decided here, before
// rendering. The pages keep their own guard as a second line of defense.
import { NextResponse, type NextRequest } from 'next/server';

import { sddDemos } from './app/%5Fdev/sdd/registry';
import { findSddDemo, sddPagesEnabled } from './lib/sdd-pages';

// Unmatched internal path: rendered by app/not-found.tsx with a real 404 status.
const NOT_FOUND_PATH = '/_sdd-not-found';

// Only mockup references listed by the SPEC-005 inventory may pass the guard (SPEC-005, EF-5).
const REFERENCE_NAME = /^SCR-\d{2}-[a-z0-9-]+-(?:desktop|mobile)\.png$/;

export function proxy(request: NextRequest): NextResponse {
  const segments = request.nextUrl.pathname.split('/').filter(Boolean);
  const specId = segments[2];
  const reference =
    segments.length === 4 && segments[2] === 'reference' && REFERENCE_NAME.test(segments[3] ?? '');
  const allowed =
    sddPagesEnabled(process.env) &&
    segments[1] === 'sdd' &&
    (reference ||
      (segments.length <= 3 &&
        (specId === undefined || findSddDemo(specId, sddDemos) !== undefined)));
  if (allowed) return NextResponse.next();
  return NextResponse.rewrite(new URL(NOT_FOUND_PATH, request.url), { status: 404 });
}

export const config = {
  matcher: ['/_dev', '/_dev/:path*'],
};
