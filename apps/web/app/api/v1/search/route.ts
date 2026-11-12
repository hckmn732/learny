import { searchGlobal } from '@learny/contracts';
import { searchUserContent } from '@learny/services';

import { handler } from '../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-212 EF-1 to EF-5: global search over the learner's notions, course chapters and formations.
// The service runs the private SQL function under the learner's JWT (Row Level Security).
export const GET = handler(searchGlobal, ({ ctx, query }) => searchUserContent(ctx, query));
