import { resourcesCreate } from '@learny/contracts';
import { createResource } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-206 EF-3: a note, a web page or a YouTube video, created `queued` and never `ready`.
export const POST = handler(resourcesCreate, ({ ctx, params, body }) =>
  createResource(ctx, params.cid, body),
);
