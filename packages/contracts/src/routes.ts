import { devRoutes } from './dev';
import { devJobsRoutes } from './dev-jobs';
import { healthRoutes } from './health';

// Registry of every route (SPEC-201 ET-1). Each domain exports its routes; they are merged here.
// A test checks the uniqueness of `id` and of `method + path`.
export const ROUTES = {
  ...healthRoutes,
  ...devRoutes,
  ...devJobsRoutes,
} as const;

export type RouteName = keyof typeof ROUTES;
