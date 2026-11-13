import { confirmExamFormatRoute } from '@learny/contracts';
import { confirmExamFormat } from '@learny/services';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-614 ET-3, CA-1 — an extracted guide format stays inactive until this explicit confirmation.
export const POST = handler(confirmExamFormatRoute, ({ ctx, params, body }) => {
  void body;
  return confirmExamFormat(ctx, params.fid);
});
