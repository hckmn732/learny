// Reads and mutations of the notification centre (SPEC-3102 EF-3, ET-2, CL-2; canevas § 4).
//
// One query key per filter, so the page a learner already read stays in the cache while the other
// filter loads. The mutations publish the unread count the server answers and invalidate the
// pages, which keeps the pastille of the header in step (CA-2).
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import type { NotificationFilter, NotificationItem, NotificationListDto } from '@learny/contracts';

import { requireApiClient } from '../../api/registry';
import { queryKeys } from '../../data/keys';

export type NotificationsStatus = 'loading' | 'error' | 'ready';

export interface NotificationsQuery {
  readonly status: NotificationsStatus;
  readonly data: NotificationListDto | null;
  readonly refreshing: boolean;
  readonly refetch: () => void;
}

/** Page of the notification centre for one filter (`GET /notifications?filter=`). */
export function useNotifications(filter: NotificationFilter): NotificationsQuery {
  const query = useQuery({
    queryKey: queryKeys.notifications(filter),
    queryFn: () => requireApiClient().api.notificationsList({ query: { filter, limit: 50 } }),
    retry: 1,
  });
  return {
    status: query.isError ? 'error' : query.data === undefined ? 'loading' : 'ready',
    data: query.data ?? null,
    refreshing: query.isFetching && query.data !== undefined,
    refetch: () => {
      void query.refetch();
    },
  };
}

/** Republishes the unread count of a read answer and refreshes the pages (CA-2). */
function publish(client: QueryClient, unreadCount: number): void {
  client.setQueryData(queryKeys.unreadCount(), { count: unreadCount });
  void client.invalidateQueries({ queryKey: ['notifications', 'list'] });
}

export interface NotificationActions {
  /** Marks one row read; answers the remaining unread count. */
  readonly markRead: (item: NotificationItem) => Promise<number>;
  /** Marks every row read; answers the remaining unread count (always 0). */
  readonly readAll: () => Promise<number>;
  readonly pending: boolean;
}

/** Mutations of the sheet, bound to the query cache of the application. */
export function useNotificationActions(): NotificationActions {
  const client = useQueryClient();
  const read = useMutation({
    mutationFn: (item: NotificationItem) =>
      requireApiClient().api.notificationRead({ params: { id: item.id } }),
  });
  const readAll = useMutation({
    mutationFn: () => requireApiClient().api.notificationsReadAll({}),
  });

  return {
    markRead: async (item) => {
      const result = await read.mutateAsync(item);
      publish(client, result.unreadCount);
      return result.unreadCount;
    },
    readAll: async () => {
      const result = await readAll.mutateAsync();
      publish(client, result.unreadCount);
      return result.unreadCount;
    },
    pending: read.isPending || readAll.isPending,
  };
}
