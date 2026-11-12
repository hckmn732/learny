import { meExportRequest } from '@learny/contracts';
import { requestExport } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-211 EF-1: idempotent export request; a job already queued or running is returned as is.
export const POST = handler(meExportRequest, ({ ctx }) => requestExport(ctx));
