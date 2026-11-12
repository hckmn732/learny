import { resourcesReadUrl } from '@learny/contracts';
import { getSignedReadUrl } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';
import { resourceDeps } from '../../../../../../lib/api/resource-deps';

export const dynamic = 'force-dynamic';

// SPEC-206 EF-4: a ten-minute read URL, issued after the ownership check (never stored).
export const GET = handler(resourcesReadUrl, ({ ctx, params }) =>
  getSignedReadUrl(ctx, resourceDeps(), params.rid),
);
