// Notification centre of the shell (SPEC-3102 EF-3, CA-2, CL-1, CL-2).
//
// Connected sheet: the page of the selected filter, the pull-to-refresh, the read mutations and
// the opening of the row. Offline, the cached page stays visible and the read actions wait for
// the network (CL-2); a row whose destination no longer exists is marked read and says so
// (CL-1). The toast never blocks the sheet.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { NotificationFilter, NotificationItem } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { openOnWeb } from '../../lib/web';
import { useOnlineStatus } from '../../offline/network';
import { theme } from '../../theme';
import { Toast } from '../../ui/Toast';

import { destinationOf } from './destinations';
import { NotificationsView } from './NotificationsView';
import { useNotificationActions, useNotifications } from './use-notifications';

const t = fr.shell.notifications;
const m = fr.mobile.notifications;

/** Content of `app/notifications.tsx`. */
export function NotificationsSheet() {
  const router = useRouter();
  const online = useOnlineStatus();
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [message, setMessage] = useState<string | null>(null);
  const query = useNotifications(filter);
  const actions = useNotificationActions();

  const close = (): void => {
    router.back();
  };

  const activate = async (item: NotificationItem): Promise<void> => {
    // CL-1 — opening a row always marks it read, even when its content disappeared.
    if (online && item.readAt === null) {
      try {
        await actions.markRead(item);
      } catch {
        setMessage(t.readError);
        return;
      }
    }
    const destination = destinationOf(item);
    if (destination.kind === 'none') {
      setMessage(m.unavailable);
      return;
    }
    close();
    if (destination.kind === 'web') {
      await openOnWeb(destination.path);
      return;
    }
    router.push(destination.path);
  };

  const readAll = async (): Promise<void> => {
    try {
      await actions.readAll();
      setMessage(m.markedAllRead);
    } catch {
      setMessage(t.readAllError);
    }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <NotificationsView
        status={query.status}
        data={query.data}
        filter={filter}
        onFilterChange={setFilter}
        onReadAll={() => {
          void readAll();
        }}
        onActivate={(item) => {
          void activate(item);
        }}
        onRetry={query.refetch}
        onRefresh={query.refetch}
        onManage={() => {
          close();
          router.replace('/profil');
        }}
        onClose={close}
        refreshing={query.refreshing}
        readOnly={!online}
        pending={actions.pending}
      />
      <View style={styles.toast} pointerEvents="none">
        <Toast
          testID="notifications-toast"
          visible={message !== null}
          message={message ?? ''}
          onHide={() => {
            setMessage(null);
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    bottom: theme.spacing.xxxl,
    left: 0,
    right: 0,
  },
});
