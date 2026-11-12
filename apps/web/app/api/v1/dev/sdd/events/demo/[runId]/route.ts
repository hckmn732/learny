import { devEventsDemoRun } from '@learny/contracts';
import { getDemoRun } from '@learny/services';

import { devOnly } from '../../../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// Demonstration route of SPEC-203: state of a pipeline run (polled by the page every second).
export const GET = devOnly(
  handler(devEventsDemoRun, ({ ctx, params }) => getDemoRun(ctx, params.runId)),
);
