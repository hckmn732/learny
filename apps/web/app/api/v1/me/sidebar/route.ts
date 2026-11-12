import { sidebarGet, sidebarUpdate } from '@learny/contracts';
import { getSidebar, updateSidebar } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-304 — menu latéral of the authenticated learner. The service runs under the learner's JWT:
// RLS keeps another learner's formations and counters out of the DTO.
export const GET = handler(sidebarGet, ({ ctx }) => getSidebar(ctx));

export const PATCH = handler(sidebarUpdate, ({ ctx, body }) => updateSidebar(ctx, body));
