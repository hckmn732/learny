// Inngest entry point of the web host (ADR-0017): same client and registry as apps/worker.
// No user session: the SDK verifies Inngest's signature (signing key stays server side).
import { serve } from 'inngest/next';

import { functions, inngest, setJobErrorReporter } from '@learny/jobs';

import { getServerReporter } from '../../../lib/sentry';

export const dynamic = 'force-dynamic';

// Final failures of the functions go to the same safe reporter as the API (SPEC-203 ET-4, SPEC-010).
setJobErrorReporter((report) => {
  getServerReporter().capture(report.error, {
    route: `job:${report.job}`,
    ...(report.jobId === undefined ? {} : { jobId: report.jobId }),
    ...(report.userId === undefined ? {} : { userId: report.userId }),
  });
});

export const { GET, POST, PUT } = serve({ client: inngest, functions });
