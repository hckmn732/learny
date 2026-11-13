import { aiRoutes } from './ai';
import { aiCredentialRoutes } from './ai-credentials';
import { authRoutes } from './auth';
import { billingRoutes } from './billing';
import { brickRoutes } from './bricks';
import { devRoutes } from './dev';
import { billingDevRoutes } from './dev-billing';
import { devJobsRoutes } from './dev-jobs';
import { devEmailRoutes, emailRoutes } from './email';
import { gapRoutes } from './gaps';
import { headerRoutes } from './header';
import { healthRoutes } from './health';
import { notificationRoutes, notificationsDevRoutes } from './notifications';
import { personalDataDevRoutes, personalDataRoutes } from './personal-data';
import { pushDevRoutes, pushRoutes } from './push';
import { searchRoutes } from './search';
import { securityRoutes } from './security';
import { sidebarRoutes } from './sidebar';
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
  ...pushRoutes,
  ...pushDevRoutes,
  ...devJobsRoutes,
  ...searchRoutes,
  ...headerRoutes,
  ...sidebarRoutes,
  ...aiRoutes,
  ...billingRoutes,
  ...brickRoutes,
  ...billingDevRoutes,
  ...emailRoutes,
  ...devEmailRoutes,
  ...notificationRoutes,
  ...notificationsDevRoutes,
  ...personalDataRoutes,
  ...personalDataDevRoutes,
  ...aiCredentialRoutes,
  ...gapRoutes,
} as const;

export type RouteName = keyof typeof ROUTES;
