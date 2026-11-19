import {
  resourcesCreate,
  resourcesDelete,
  resourcesFinalize,
  resourcesReadUrl,
  uploadsCreate,
} from '@learny/contracts';
import { IDEMPOTENCY_KEY_HEADER, readIdempotencyKey } from '@learny/http/idempotency';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  createResource,
  createUpload,
  deleteResource,
  finalizeUpload,
  getSignedReadUrl,
} from '@learny/services';

import { resourceDeps } from '../deps/resource-deps';

// SPEC-1004 ET-1 - implementations of the `uploads` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const uploadsImplementations = {
  resourcesCreate: ({ ctx, params, body }: HandlerArgs<typeof resourcesCreate>) =>
    createResource(ctx, params.cid, body),
  uploadsCreate: ({ ctx, params, body, request }: HandlerArgs<typeof uploadsCreate>) =>
    createUpload(ctx, resourceDeps(), params.cid, {
      ...body,
      idempotencyKey: readIdempotencyKey(request.headers.get(IDEMPOTENCY_KEY_HEADER)),
    }),
  resourcesFinalize: ({ ctx, params }: HandlerArgs<typeof resourcesFinalize>) =>
    finalizeUpload(ctx, resourceDeps(), params.rid),
  resourcesDelete: ({ ctx, params }: HandlerArgs<typeof resourcesDelete>) =>
    deleteResource(ctx, resourceDeps(), params.rid),
  resourcesReadUrl: ({ ctx, params }: HandlerArgs<typeof resourcesReadUrl>) =>
    getSignedReadUrl(ctx, resourceDeps(), params.rid),
};
