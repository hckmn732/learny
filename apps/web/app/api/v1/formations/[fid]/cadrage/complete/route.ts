import { cadrageRoutes } from '@learny/contracts';
import { completeCadrage } from '@learny/services';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

export const POST = handler(cadrageRoutes.cadrageComplete, ({ ctx, params }) =>
  completeCadrage(ctx, params.fid),
);
