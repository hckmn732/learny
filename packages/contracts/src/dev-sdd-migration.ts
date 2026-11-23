import { z } from 'zod';

import { defineRoute } from './define-route';

const payload = z.unknown();
const actionBody = z.object({
  action: z.string().optional(),
  id: z.string().optional(),
  task: z.string().optional(),
  scenario: z.string().optional(),
  provider: z.string().optional(),
  model: z.string().optional(),
  baseUrl: z.string().optional(),
  apiKey: z.string().optional(),
  title: z.string().optional(),
  url: z.string().optional(),
  reason: z.string().optional(),
  decision: z.string().optional(),
  spend: z.string().optional(),
  brickId: z.string().optional(),
});

function action(name: string, spec: string, idempotent = true) {
  return defineRoute({
    id: `dev.sdd.${spec.toLowerCase()}.${name}`,
    method: 'POST',
    path: `/api/v1/dev/sdd/${spec}/${name}`,
    auth: 'public',
    body: actionBody,
    output: payload,
    successStatus: 200,
    rateLimit: 'none',
    ...(idempotent ? { requiresIdempotencyKey: true as const } : {}),
    summary: `Action ${name} de la démonstration ${spec}.`,
    errors: ['NOT_FOUND', 'VALIDATION_FAILED', 'IDEMPOTENCY_IN_PROGRESS'],
  });
}


export const devSddStripeCheckout = action('session', 'stripe');

export const devSddMigrationRoutes = { devSddStripeCheckout } as const;
