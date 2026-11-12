import { notificationsList } from '@learny/contracts';
import { listNotifications } from '@learny/services';

import { handler } from '../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-306 — paginated inbox of the authenticated learner. The service runs under the learner's
// JWT: RLS keeps another learner's notifications out of the page and of both counters.
export const GET = handler(notificationsList, ({ ctx, query }) => listNotifications(ctx, query));
