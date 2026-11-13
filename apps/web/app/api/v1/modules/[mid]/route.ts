import { moduleScreen } from '@learny/contracts';
import { getModuleScreen } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-607 — SCR-06 read model: chapters, apports, suggestions and quotas of one module.
export const GET = handler(moduleScreen, ({ ctx, params, query }) =>
  getModuleScreen(ctx, params.mid, query.chapitre),
);
