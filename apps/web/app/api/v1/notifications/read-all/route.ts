import { notificationsReadAll } from '@learny/contracts';
import { markAllRead } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-306 — idempotent read-all of the authenticated learner (ET-2, EF-3).
export const POST = handler(notificationsReadAll, ({ ctx }) => markAllRead(ctx));
