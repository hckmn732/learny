import { z } from 'zod';

import { defineRoute } from './define-route';

// Public health contract of GET /api/v1/health (SPEC-006, ET-2; SPEC-010, EF-5).
// Fields may be added later; none of the required ones below may be removed.
export const HEALTH_STATUSES = ['ok', 'degraded'] as const;
export const DATABASE_STATUSES = ['ok', 'unavailable', 'not_configured'] as const;
export const COMPONENT_STATUSES = ['ok', 'unavailable', 'not_configured'] as const;

export const HealthComponentsSchema = z.looseObject({
  database: z.enum(DATABASE_STATUSES),
  build: z.enum(COMPONENT_STATUSES),
});

export const HealthResponse = z.looseObject({
  status: z.enum(HEALTH_STATUSES),
  version: z.string().min(1).max(64),
  commit: z.string().min(1).max(64),
  database: z.enum(DATABASE_STATUSES),
  components: HealthComponentsSchema,
});

export type HealthResponse = z.infer<typeof HealthResponse>;
export type HealthStatus = HealthResponse['status'];
export type DatabaseStatus = HealthResponse['database'];
export type ComponentStatus = (typeof COMPONENT_STATUSES)[number];
export type HealthComponents = z.infer<typeof HealthComponentsSchema>;

export const healthRoutes = {
  health: defineRoute({
    id: 'health.get',
    method: 'GET',
    path: '/api/v1/health',
    auth: 'public',
    output: HealthResponse,
    successStatus: 200,
    rateLimit: 'none',
    summary: "État de santé de l'application (base, version).",
    errors: [],
  }),
} as const;
