import { resourcesFinalize } from '@learny/contracts';
import { finalizeUpload } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';
import { resourceDeps } from '../../../../../../lib/api/resource-deps';

export const dynamic = 'force-dynamic';

// SPEC-206 EF-2: measures the uploaded bytes, then accepts the contribution (idempotent).
export const POST = handler(resourcesFinalize, ({ ctx, params }) =>
  finalizeUpload(ctx, resourceDeps(), params.rid),
);
