import { devItems as devItemsRoute } from '@learny/contracts';
import { listDevItems } from '@learny/services';

import { devOnly } from '../../../../../../lib/api/dev-guard';
import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// Demonstration route of SPEC-201: cursor pagination over 57 deterministic items.
export const GET = devOnly(
  handler(devItemsRoute, ({ ctx, query }) => Promise.resolve(listDevItems(ctx, query))),
);
