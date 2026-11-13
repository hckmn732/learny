import { cadrageRoutes, formationRoutes } from '@learny/contracts';
import { createFormation, listFormations } from '@learny/services';

import { handler } from '../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

export const GET = handler(formationRoutes.formationsList, ({ ctx }) => listFormations(ctx));

export const POST = handler(formationRoutes.formationsCreate, ({ ctx, body }) =>
  createFormation(ctx, body),
);
