import { devRoutes } from './dev';
import { healthRoutes } from './health';
import { uploadsDevRoutes, uploadsRoutes } from './uploads';

// Registry of every route (SPEC-201 ET-1). Each domain exports its routes; they are merged here.
// A test checks the uniqueness of `id` and of `method + path`.
export const ROUTES = {
  ...healthRoutes,
  ...devRoutes,
  ...uploadsRoutes,
  ...uploadsDevRoutes,
} as const;

export type RouteName = keyof typeof ROUTES;
