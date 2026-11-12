import { authRoutes } from './auth';
import { devRoutes } from './dev';
import { devJobsRoutes } from './dev-jobs';
import { healthRoutes } from './health';
import { searchRoutes } from './search';
import { securityRoutes } from './security';
import { uploadsDevRoutes, uploadsRoutes } from './uploads';

// Registry of every route (SPEC-201 ET-1). Each domain exports its routes; they are merged here.
// A test checks the uniqueness of `id` and of `method + path`.
export const ROUTES = {
  ...healthRoutes,
  ...authRoutes,
  ...devRoutes,
  ...securityRoutes,
  ...uploadsRoutes,
  ...uploadsDevRoutes,
  ...devJobsRoutes,
  ...searchRoutes,
} as const;

export type RouteName = keyof typeof ROUTES;
