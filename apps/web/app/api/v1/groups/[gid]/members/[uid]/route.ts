import { groupMemberRemove } from '@learny/contracts';
import { removeMemberFromGroup } from '@learny/services';

import { handler } from '../../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-724 ET-3, BR-GRP-05 — the owner removes one member. The removed member's private history
// is preserved by the individual copy created in the same transaction.
export const DELETE = handler(groupMemberRemove, ({ ctx, params }) =>
  removeMemberFromGroup(ctx, params.gid, params.uid),
);
