import { homeGet } from '@learny/contracts';
import { getHome } from '@learny/services';

import { handler } from '../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-603 — one authenticated read of the learner's home screen. RLS keeps every row of another
// learner out of the DTO; the route never calls an AI provider.
export const GET = handler(homeGet, ({ ctx }) => getHome(ctx));
