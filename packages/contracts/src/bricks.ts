import { z } from 'zod';

import { Uuid } from './common';
import { defineRoute } from './define-route';

// Contracts of the brick lifecycle routes (SPEC-501 ET-9, EF-3, EF-4, EF-7). The payload stays
// opaque at this boundary: the service validates it against the type schema and returns
// `422 BRICK_INVALID` with readable issues (BR-IA-11).

export const BrickIdParams = z.object({ bid: Uuid }).strict();
export type BrickIdParams = z.infer<typeof BrickIdParams>;

/** EF-3 — 1 to 500 characters, trimmed by the schema then again by the service. */
export const BrickReportBody = z.object({ reason: z.string().trim().min(1).max(500) }).strict();
export type BrickReportBody = z.infer<typeof BrickReportBody>;

export const BrickReportResult = z.object({ reportId: Uuid, status: z.literal('open') }).strict();
export type BrickReportResult = z.infer<typeof BrickReportResult>;

/** EF-4 — a learner correction with optimistic concurrency on `bricks.current_version`. */
export const BrickCorrectionBody = z
  .object({ expectedVersion: z.number().int().min(1), payload: z.unknown() })
  .strict();
export type BrickCorrectionBody = z.infer<typeof BrickCorrectionBody>;

export const BrickVersionResult = z
  .object({
    brickId: Uuid,
    version: z.number().int().min(2),
    versionId: Uuid,
  })
  .strict();
export type BrickVersionResult = z.infer<typeof BrickVersionResult>;

/** EF-3 — a POST that creates a report; a replay with the same key returns the first answer. */
export const brickReport = defineRoute({
  id: 'bricks.report',
  method: 'POST',
  path: '/api/v1/bricks/:bid/report',
  auth: 'user',
  params: BrickIdParams,
  body: BrickReportBody,
  output: BrickReportResult,
  successStatus: 201,
  idempotent: true,
  rateLimit: 'default',
  summary:
    'Signale une brique du seul utilisateur connecté, la retire des tirages et renvoie le signalement ouvert (SPEC-501).',
  errors: [
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'BRICK_RETIRED',
    'IDEMPOTENCY_KEY_REQUIRED',
    'UNAUTHENTICATED',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
  ],
});

/** EF-4 — learner correction: creates version N+1, resolves open reports, reactivates the brick. */
export const brickCorrect = defineRoute({
  id: 'bricks.correct',
  method: 'PATCH',
  path: '/api/v1/bricks/:bid',
  auth: 'user',
  params: BrickIdParams,
  body: BrickCorrectionBody,
  output: BrickVersionResult,
  successStatus: 200,
  rateLimit: 'default',
  summary:
    'Corrige une brique du seul utilisateur connecté en créant une nouvelle version (SPEC-501).',
  errors: [
    'VALIDATION_FAILED',
    'NOT_FOUND',
    'CONFLICT',
    'BRICK_INVALID',
    'BRICK_RETIRED',
    'UNAUTHENTICATED',
    'RATE_LIMITED',
    'INTERNAL_ERROR',
  ],
});

export const brickRoutes = {
  brickReport,
  brickCorrect,
} as const;
