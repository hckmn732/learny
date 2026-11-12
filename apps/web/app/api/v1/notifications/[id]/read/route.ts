import { notificationRead } from '@learny/contracts';
import { markNotificationRead } from '@learny/services';

import { handler } from '../../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-306 — marks one owned notification read before the target navigation (ET-2, CL-1).
export const POST = handler(notificationRead, ({ ctx, params }) =>
  markNotificationRead(ctx, params.id),
);
