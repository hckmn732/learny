import { courseCitationSource } from '@learny/contracts';
import { getCitationSource } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';
import { resourceDeps } from '../../../../../../lib/api/resource-deps';

export const dynamic = 'force-dynamic';

// SPEC-609 EF-2 — the browser asks with the citation id; the service resolves the owner's passage.
export const GET = handler(courseCitationSource, ({ ctx, params }) =>
  getCitationSource(ctx, resourceDeps(), params.cid),
);
