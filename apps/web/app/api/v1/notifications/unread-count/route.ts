import { notificationsUnreadCount } from '@learny/contracts';
import { getUnreadNotificationCount } from '@learny/services';

import { handler } from '../../../../../lib/api/handler';

export const dynamic = 'force-dynamic';

// SPEC-306 — badge count of the authenticated learner (BR-NOT-01, ET-1).
export const GET = handler(notificationsUnreadCount, ({ ctx }) => getUnreadNotificationCount(ctx));
