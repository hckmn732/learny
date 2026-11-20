import {
  notificationRead,
  notificationsList,
  notificationsReadAll,
  notificationsUnreadCount,
} from '@learny/contracts';
import type { HandlerArgs } from '@learny/http/route-handler';
import {
  getUnreadNotificationCount,
  listNotifications,
  markAllRead,
  markNotificationRead,
} from '@learny/services';

// SPEC-1004 ET-1 - implementations of the `notifications` contract, moved verbatim from the Next route
// files so that `apps/api` (SPEC-1101) serves exactly the same code.
export const notificationsImplementations = {
  notificationRead: ({ ctx, params }: HandlerArgs<typeof notificationRead>) =>
    markNotificationRead(ctx, params.id),
  notificationsReadAll: ({ ctx }: HandlerArgs<typeof notificationsReadAll>) => markAllRead(ctx),
  notificationsList: ({ ctx, query }: HandlerArgs<typeof notificationsList>) =>
    listNotifications(ctx, query),
  notificationsUnreadCount: ({ ctx }: HandlerArgs<typeof notificationsUnreadCount>) =>
    getUnreadNotificationCount(ctx),
};
