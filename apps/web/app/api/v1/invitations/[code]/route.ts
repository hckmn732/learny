import { invitationGet } from '@learny/contracts';
import { getInvitationPreview } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-724 ET-3 — public preview of an invitation: the formation title and capacity only. An
// unknown or rotated code is a 404 without revealing the group.
export const GET = handler(invitationGet, ({ ctx, params }) =>
  getInvitationPreview(ctx, params.code),
);
