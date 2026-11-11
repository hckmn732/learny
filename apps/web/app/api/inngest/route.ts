// Inngest entry point of the web host (ADR-0017): same client and registry as apps/worker.
// No user session: the SDK verifies Inngest's signature (signing key stays server side).
import { serve } from 'inngest/next';

import { functions, inngest } from '@learny/jobs';

export const dynamic = 'force-dynamic';

export const { GET, POST, PUT } = serve({ client: inngest, functions });
