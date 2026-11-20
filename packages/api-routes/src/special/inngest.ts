import { serve } from 'inngest/next';

import { functions, inngest, setJobErrorReporter } from '@learny/jobs';

import { getServerReporter } from '../deps/sentry';

import type { SpecialHandler } from './types';

// SPEC-1004 EF-2 — Inngest entry point (ADR-0017): same client and registry as `apps/api`. No
// user session: the SDK verifies Inngest's signature, the signing key stays server side.
// Final failures of the functions go to the same safe reporter as the API (SPEC-203 ET-4).
setJobErrorReporter((report) => {
  getServerReporter().capture(report.error, {
    route: `job:${report.job}`,
    ...(report.jobId === undefined ? {} : { jobId: report.jobId }),
    ...(report.userId === undefined ? {} : { userId: report.userId }),
  });
});

type FrameworkHandler = (request: Request, context: unknown) => Promise<Response>;

const served = serve({ client: inngest, functions }) as unknown as Record<
  'GET' | 'POST' | 'PUT',
  FrameworkHandler
>;

// The Next adapter serves the introspection (GET), the invocation (POST) and the registration (PUT)
// of the same endpoint; the host verb decides which one runs.
const handle: SpecialHandler['handle'] = (request) => {
  const handler =
    request.method === 'GET' ? served.GET : request.method === 'PUT' ? served.PUT : served.POST;
  return handler(request, undefined);
};

export const inngestSpecial: SpecialHandler = {
  method: 'ALL',
  path: '/api/inngest',
  handle,
};
