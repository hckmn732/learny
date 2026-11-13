import { cadrageRoutes } from '@learny/contracts';
import { getCadrageState, postCadrageMessage } from '@learny/services';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

export const GET = handler(cadrageRoutes.cadrageGet, ({ ctx, params }) =>
  getCadrageState(ctx, params.fid),
);

export const POST = handler(cadrageRoutes.cadrageMessageCreate, ({ ctx, params, body }) =>
  postCadrageMessage(ctx, params.fid, body),
);
