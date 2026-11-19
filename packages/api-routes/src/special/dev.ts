import type { AnyRoute } from '@learny/contracts';
import { devOnly } from '@learny/http/dev-guard';
import { routeHandler } from '@learny/http/route-handler';

import type { RouteImplementation } from '../types';

import type { SpecialHandler } from './types';

/**
 * SPEC-1004 EF-2/CL-5 — a demonstration route keeps the development guard of SPEC-201: outside
 * `ENABLE_SDD_PAGES` it answers the same problem+json 404 as before, before any authentication.
 */
export function devRoute<R extends AnyRoute>(
  route: R,
  implementation: RouteImplementation<R>,
): SpecialHandler {
  const guarded = devOnly(routeHandler(route, implementation));
  return {
    method: route.method,
    path: route.path,
    handle: (request, params) => guarded(request, { params: Promise.resolve(params) }),
  };
}
