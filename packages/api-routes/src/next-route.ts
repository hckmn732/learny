import type { AnyRoute } from '@learny/contracts';
import { ROUTES } from '@learny/contracts';
import { routeHandler } from '@learny/http/route-handler';

import { SPECIAL_HANDLERS, type SpecialKey } from './special';
import { ROUTE_IMPLEMENTATIONS } from './tables';
import type { RouteImplementation } from './types';

type Segment = { params: Promise<Record<string, string | string[]>> };

/**
 * SPEC-1004 ET-3 — the two entry points of the generated Next files. `nextRoute` resolves the
 * contract and its implementation from the tables; `nextSpecial` returns the special handler.
 */
export type RouteKey = keyof typeof ROUTE_IMPLEMENTATIONS;

export function nextRoute(
  id: RouteKey,
): (request: Request, segment?: Segment) => Promise<Response> {
  const routes = ROUTES as Record<RouteKey, AnyRoute>;
  const implementations = ROUTE_IMPLEMENTATIONS as Record<RouteKey, RouteImplementation<AnyRoute>>;
  const wrapped = routeHandler(routes[id], implementations[id]);
  // The host always passes the segment; an internal call may omit it.
  return (request, segment = { params: Promise.resolve({}) }) => wrapped(request, segment);
}

export type { SpecialKey };

export function nextSpecial(
  key: SpecialKey,
): (request?: Request, segment?: Segment) => Promise<Response> {
  const entry = SPECIAL_HANDLERS[key];
  // A probe or a registration endpoint may be called internally, without an HTTP request.
  return async (request, segment = { params: Promise.resolve({}) }) =>
    entry.handle(request ?? new Request(`http://localhost${entry.path}`), await segment.params);
}
