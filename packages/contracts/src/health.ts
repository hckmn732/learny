import { z } from 'zod';

// Public health contract of GET /api/v1/health (SPEC-006, ET-2).
// Fields may be added later; none of the four below may be removed.
export const HEALTH_STATUSES = ['ok', 'degraded'] as const;
export const DATABASE_STATUSES = ['ok', 'unavailable', 'not_configured'] as const;

export const HealthResponse = z.looseObject({
  status: z.enum(HEALTH_STATUSES),
  version: z.string().min(1).max(64),
  commit: z.string().min(1).max(64),
  database: z.enum(DATABASE_STATUSES),
});

export type HealthResponse = z.infer<typeof HealthResponse>;
export type HealthStatus = HealthResponse['status'];
export type DatabaseStatus = HealthResponse['database'];
