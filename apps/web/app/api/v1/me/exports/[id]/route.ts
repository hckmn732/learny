import { meExportRead } from '@learny/contracts';
import { downloadExport, getExport } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';
import { personalDataDeps } from '../../../../../../lib/api/personal-data-deps';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

// SPEC-211 EF-2, CL-4, CL-5: owner-only state; `?download=1` answers a 302 to a fresh signed URL,
// after which an expired archive is a 410. Another learner's identifier stays a 404.
export const GET = handler(meExportRead, async ({ ctx, params, query }) => {
  if (query.download === '1') {
    const result = await downloadExport(ctx, personalDataDeps(), params.id);
    if (!result.ok) return result;
    return new Response(null, {
      status: 302,
      headers: { location: result.value.url, 'cache-control': 'no-store' },
    });
  }
  return getExport(ctx, personalDataDeps(), params.id);
});
