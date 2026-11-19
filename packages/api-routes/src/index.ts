import { configureApiRoutes } from './deps/http-boot';

// SPEC-1004 — importing the tables configures the HTTP layer of the process (see deps/http-boot):
// every host (Next today, Hono in SPEC-1101) gets the same reporter, limiter and origin guard.
configureApiRoutes();

export {
  expectedRouteFiles,
  filePathOf,
  routeCoverage,
  type GeneratedRouteFile,
  type RouteCoverage,
} from './coverage';
export { nextRoute, nextSpecial, type SpecialKey } from './next-route';
export { SPECIAL_HANDLERS, type SpecialHandler } from './special';
export { ROUTE_IMPLEMENTATIONS } from './tables';
export type { RouteImplementation } from './types';
