import { z } from 'zod';

import { DEMO_STEPS, inngest, runDemoJob, sddDemoStore, toJobLogger } from '@learny/jobs';
import { executeDirect } from '@learny/jobs/testing';

import { sddPagesEnabled } from '../../../../../lib/sdd-pages';

export const dynamic = 'force-dynamic';

// Loose shape only: the job itself validates the input (bounds, empty runId) and reports it.
const Body = z.object({ runId: z.string().max(200), value: z.number() });

function invalidRequest(): Response {
  return Response.json(
    { type: 'about:blank', title: 'Requête invalide', status: 400, code: 'VALIDATION_FAILED' },
    { status: 400, headers: { 'content-type': 'application/problem+json' } },
  );
}

// Runs the shared demo job with the controlled adapter of the SDD harness (no Inngest server).
export async function POST(request: Request): Promise<Response> {
  if (!sddPagesEnabled()) return new Response(null, { status: 404 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidRequest();

  const logger = toJobLogger(inngest.logger);
  const run = await executeDirect(
    (step) => runDemoJob({ data: parsed.data, step, logger }, { store: sddDemoStore }),
    { steps: DEMO_STEPS },
  );
  const steps = run.steps.map(({ name, status, attempts }) => ({ name, status, attempts }));
  return Response.json(
    run.status === 'completed'
      ? { status: run.status, steps, result: run.output, error: null }
      : { status: run.status, steps, result: null, error: { code: run.error.code } },
    { headers: { 'cache-control': 'no-store' } },
  );
}
