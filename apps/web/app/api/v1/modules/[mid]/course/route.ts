import { moduleCourse } from '@learny/contracts';
import { getModuleCourse } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-608 — SCR-07 read model: current course version, selected chapter, sections and citations.
export const GET = handler(moduleCourse, ({ ctx, params, query }) =>
  getModuleCourse(ctx, params.mid, query.chapitre),
);
