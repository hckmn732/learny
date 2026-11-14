import { invitationAccept } from '@learny/contracts';
import { acceptInvitation } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-724 ET-3, ET-4 — joining checks the three-active-formations limit and the ten-seat capacity
// under locks; the programme becomes common while apports, courses and results stay private.
export const POST = handler(invitationAccept, ({ ctx, params }) =>
  acceptInvitation(ctx, params.code),
);
