import { headerGet } from '@learny/contracts';
import { getHeader } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-305 — fixed header of every connected screen. The service runs under the learner's JWT:
// RLS keeps another learner's profile, formations and notifications out of the DTO.
export const GET = handler(headerGet, ({ ctx }) => getHeader(ctx));
