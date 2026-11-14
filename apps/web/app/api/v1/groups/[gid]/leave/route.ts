import { groupLeave } from '@learny/contracts';
import { leaveFormationGroup } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-724 ET-3, EF-4 — a member leaves and immediately owns an individual copy of the programme
// with the same private history; the owner is refused (CL-5).
export const POST = handler(groupLeave, ({ ctx, params }) => leaveFormationGroup(ctx, params.gid));
