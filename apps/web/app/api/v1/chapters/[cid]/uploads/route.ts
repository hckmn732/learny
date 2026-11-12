import { uploadsCreate } from '@learny/contracts';
import { createUpload } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';
import { IDEMPOTENCY_KEY_HEADER, readIdempotencyKey } from '../../../../../../lib/api/idempotency';
import { resourceDeps } from '../../../../../../lib/api/resource-deps';

export const dynamic = 'force-dynamic';

// SPEC-206 EF-1: reserves a file contribution and signs its ten-minute upload URL. The idempotency
// key is handled by the service (not by the wrapper), so the signed URL is never stored (ET-4).
export const POST = handler(uploadsCreate, ({ ctx, params, body, request }) =>
  createUpload(ctx, resourceDeps(), params.cid, {
    ...body,
    idempotencyKey: readIdempotencyKey(request.headers.get(IDEMPOTENCY_KEY_HEADER)),
  }),
);
