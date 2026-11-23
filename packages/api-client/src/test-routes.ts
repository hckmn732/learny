// Route definitions used only by the typed client tests (ADR-2041): no server answers them and
// they are not part of the ROUTES registry.
import { z } from 'zod';

import { PaginationQuery, defineRoute, page } from '@learny/contracts';

// Shapes of the former SPEC-201 echo and paginated list, kept as client test fixtures.
export const EchoInput = z.object({
  message: z.string().min(1).max(200),
  fail: z.enum(['business', 'crash']).optional(),
});
export type EchoInput = z.infer<typeof EchoInput>;

export const EchoOutput = z.object({
  message: z.string(),
  receivedAt: z.string(),
  counter: z.number().int(),
});
export type EchoOutput = z.infer<typeof EchoOutput>;

export const DevItem = z.object({
  id: z.string(),
  label: z.string(),
  position: z.number().int(),
});
export type DevItem = z.infer<typeof DevItem>;

export const devEcho = defineRoute({
  id: 'dev.echo',
  method: 'POST',
  path: '/api/v1/dev/sdd/echo',
  auth: 'user',
  body: EchoInput,
  output: EchoOutput,
  successStatus: 201,
  idempotent: true,
  summary: 'Route de démonstration : écho idempotent (SPEC-201).',
  errors: ['VALIDATION_FAILED', 'FORMATION_LIMIT_REACHED', 'IDEMPOTENCY_IN_PROGRESS'],
});

export const devItems = defineRoute({
  id: 'dev.items',
  method: 'GET',
  path: '/api/v1/dev/sdd/items',
  auth: 'user',
  query: PaginationQuery,
  output: page(DevItem),
  successStatus: 200,
  summary: 'Route de démonstration : liste paginée de 57 éléments (SPEC-201).',
  errors: ['VALIDATION_FAILED'],
});

export const devRoutes = { devEcho, devItems } as const;
