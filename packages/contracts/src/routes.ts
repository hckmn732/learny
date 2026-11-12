import { authRoutes } from './auth';
import { billingRoutes } from './billing';
import { devRoutes } from './dev';
import { billingDevRoutes } from './dev-billing';
import { devJobsRoutes } from './dev-jobs';
import { healthRoutes } from './health';
import { uploadsDevRoutes, uploadsRoutes } from './uploads';

// Registry of every route (SPEC-201 ET-1). Each domain exports its routes; they are merged here.
// A test checks the uniqueness of `id` and of `method + path`.
export const ROUTES = {
  ...healthRoutes,
  ...authRoutes,
  ...devRoutes,
  ...uploadsRoutes,
  ...uploadsDevRoutes,
  ...devJobsRoutes,
  ...billingRoutes,
  ...billingDevRoutes,
} as const;

export type RouteName = keyof typeof ROUTES;
