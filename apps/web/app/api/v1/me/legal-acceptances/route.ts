import { meLegalAccept } from '@learny/contracts';
import { acceptLegalVersions } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-806 EF-3/EF-4 — records the active CGU and privacy versions together, once, under the
// learner's RLS. A stale version is refused with the two expected versions.
export const POST = handler(meLegalAccept, ({ ctx, body }) => acceptLegalVersions(ctx, body));
