import { ROUTES } from '@learny/contracts';
import { handler } from '@learny/http/handler';

import { healthResponse } from '../deps/health';

import type { SpecialHandler } from './types';

// SPEC-1004 EF-2 — the health probe keeps the legacy wrapper of SPEC-010: it is public, exempt from
// the origin guard and from the rate limiter, and answers a non-JSON contract of its own.
const probe = handler({ route: ROUTES.health.path }, () => healthResponse());

export const healthSpecial: SpecialHandler = {
  method: ROUTES.health.method,
  path: ROUTES.health.path,
  // The probe is also callable without a request (server checks, tests): same default as before.
  handle: (request?: Request) =>
    probe(request ?? new Request(`http://localhost${ROUTES.health.path}`)),
};
