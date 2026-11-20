import {
  meDeletionCancel,
  meDeletionSchedule,
  meExportRead,
  meExportRequest,
} from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  cancelDeletion,
  downloadExport,
  getExport,
  requestExport,
  scheduleDeletion,
} from '@learny/services';

import { personalDataDeps } from '../deps/personal-data-deps';

// SPEC-1004 ET-1 - implementations of the `personal-data` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const personalDataImplementations = {
  meDeletionSchedule: ({ ctx }: HandlerArgs<typeof meDeletionSchedule>) => scheduleDeletion(ctx),
  meDeletionCancel: async ({ ctx }: HandlerArgs<typeof meDeletionCancel>) => {
    const result = await cancelDeletion(ctx);
    return result.ok ? undefined : result;
  },
  meExportRequest: ({ ctx }: HandlerArgs<typeof meExportRequest>) => requestExport(ctx),
  meExportRead: async ({ ctx, params, query }: HandlerArgs<typeof meExportRead>) => {
    if (query.download === '1') {
      const result = await downloadExport(ctx, personalDataDeps(), params.id);
      if (!result.ok) return result;
      return new Response(null, {
        status: 302,
        headers: { location: result.value.url, 'cache-control': 'no-store' },
      });
    }
    return getExport(ctx, personalDataDeps(), params.id);
  },
};
