import { resourcesDelete } from '@learny/contracts';
import { deleteResource } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';
import { resourceDeps } from '../../../../../lib/api/resource-deps';

export const dynamic = 'force-dynamic';

// SPEC-206 EF-5: deletes the contribution, keeps the citations as « source supprimée » (idempotent).
export const DELETE = handler(resourcesDelete, ({ ctx, params }) =>
  deleteResource(ctx, resourceDeps(), params.rid),
);
