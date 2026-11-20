import { z } from 'zod';

import { defineRoute } from './define-route';

export const ApiCoverageResponse = z.strictObject({
  registry: z.number().int().nonnegative(),
  standard: z.number().int().nonnegative(),
  specials: z.number().int().nonnegative(),
  files: z.number().int().nonnegative(),
  generated: z.number().int().nonnegative(),
  drift: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  uncovered: z.array(z.string()),
  specialDrift: z.array(z.string()),
});

export const devSddApiCoverage = defineRoute({
  id: 'dev.sddApiCoverage',
  method: 'GET',
  path: '/api/v1/dev/sdd/api/coverage',
  auth: 'public',
  output: ApiCoverageResponse,
  successStatus: 200,
  rateLimit: 'none',
  summary: 'Couverture des routes servies par apps/api (SPEC-1101).',
  errors: ['NOT_FOUND'],
});

export const devMigrationRoutes = { devSddApiCoverage } as const;
