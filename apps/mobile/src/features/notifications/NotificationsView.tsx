// Presentation of the notification centre (SPEC-3102 EF-3, BR-NOT-01, BR-NOT-02, ET-5).
//
// The sheet of the mockup: bell tile, title and unread sub-title, the All / Unread filter and
// « Tout marquer comme lu », then the three groups « Aujourd'hui », « Hier » and « Plus tôt »,
// and the e-mail note with « Gérer les notifications ». Every row announces its title, its body
// and its state; a read-only sheet (offline, CL-2) keeps the list and says why the actions wait.
import { Pressable, StyleSheet, View } from 'react-native';

import type { NotificationFilter, NotificationItem, NotificationListDto } from '@learny/contracts';
import { fr } from '@learny/i18n';

import { clock } from '../../lib/clock';
import { formatShortDay, formatTime } from '../../lib/dates';
import { theme } from '../../theme';
import { EmptyState } from '../../ui/EmptyState';
import { ErrorState } from '../../ui/ErrorState';
import { Icon } from '../../ui/Icon';
import { Segmented } from '../../ui/Segmented';
import { Skeleton } from '../../ui/Skeleton';
import { Text } from '../../ui/Text';
import { RouteSheet } from '../shell/RouteSheet';

import { iconOf } from './destinations';
import { groupNotifications } from './group-by-day';

const t = fr.shell.notifications;
const m = fr.mobile.notifications;

export interface NotificationsViewProps {
  readonly status: 'loading' | 'error' | 'ready';
  readonly data: NotificationListDto | null;
  readonly filter: NotificationFilter;
  readonly onFilterChange: (filter: NotificationFilter) => void;
  readonly onReadAll: () => void;
  readonly onActivate: (item: NotificationItem) => void;
  readonly onRetry: () => void;
  readonly onRefresh: () => void;
  readonly onManage: () => void;
  readonly onClose: () => void;
  readonly refreshing: boolean;
  /** Offline: the cached page is shown, the read actions wait for the network (CL-2). */
  readonly readOnly: boolean;
  readonly pending: boolean;
}

/** Hour of a row: `13:20` today and yesterday, `lun. 9 nov.` earlier (ET-5). */
export function notificationTime(item: NotificationItem, timeZone: string): string {
  return item.group === 'earlier'
    ? formatShortDay(item.createdAt, timeZone)
    : formatTime(item.createdAt, timeZone);
}

/** Notification centre, presentational. */
export function NotificationsView({
  status,
  data,
  filter,
  onFilterChange,
  onReadAll,
  onActivate,
  onRetry,
  onRefresh,
  onManage,
  onClose,
  refreshing,
  readOnly,
  pending,
}: NotificationsViewProps) {
  const items = data?.items ?? [];
  const timeZone = data?.timezone ?? 'Europe/Paris';
  const unread = data?.unreadCount ?? 0;
  const sections = groupNotifications(items, timeZone, clock.now());
  const readAllDisabled = unread === 0 || readOnly || pending;

  return (
    <RouteSheet
      testID="notifications-sheet"
      title={t.panelTitle}
      subtitle={m.unreadLabel(unread)}
      icon="bell"
      onClose={onClose}
      refreshing={refreshing}
      onRefresh={onRefresh}
      footer={
        <View style={styles.footer}>
          <Text variant="bodySmall" tone="muted">
            {t.emailNote}
          </Text>
          <Pressable
            testID="notifications-manage"
            accessibilityRole="link"
            accessibilityLabel={t.manage}
            onPress={onManage}
          >
            <Text variant="bodySmall" tone="indigoInk">
              {t.manage}
            </Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.tools}>
        <View style={styles.filter}>
          <Segmented
            testID="notifications-filter"
            label={t.filtersLabel}
            options={[
              { value: 'all', label: t.filterAll },
              { value: 'unread', label: t.filterUnread },
            ]}
            value={filter}
            disabled={readOnly}
            onChange={(value) => {
              onFilterChange(value === 'unread' ? 'unread' : 'all');
            }}
          />
        </View>
        <Pressable
          testID="notifications-read-all"
          accessibilityRole="button"
          accessibilityLabel={unread === 0 ? t.readAllDone : t.readAll}
          accessibilityState={{ disabled: readAllDisabled }}
          disabled={readAllDisabled}
          onPress={onReadAll}
          hitSlop={theme.spacing.md}
        >
          <Text variant="chip" tone={readAllDisabled ? 'muted' : 'indigoInk'}>
            {unread === 0 ? t.readAllDone : t.readAll}
          </Text>
        </Pressable>
      </View>

      {readOnly ? (
        <Text variant="caption" tone="muted" testID="notifications-offline">
          {m.offlineReadOnly}
        </Text>
      ) : null}

      {status === 'loading' ? (
        <View testID="notifications-loading" style={styles.loading}>
          <Skeleton animated={false} lines={2} />
          <Skeleton animated={false} lines={2} />
          <Skeleton animated={false} lines={2} />
        </View>
      ) : null}

      {status === 'error' ? (
        <ErrorState
          testID="notifications-error"
          title={m.loadError}
          description={t.errorDescription}
          onRetry={onRetry}
        />
      ) : null}

      {status === 'ready' && items.length === 0 ? (
        <EmptyState
          testID="notifications-empty"
          icon="check"
          title={filter === 'unread' ? m.emptyUnread : m.empty}
          description={m.emptyBody}
        />
      ) : null}

      {status === 'ready'
        ? sections.map((section) => (
            <View key={section.group} testID={`notifications-group-${section.group}`}>
              <Text variant="label" tone="muted" style={styles.groupLabel}>
                {section.label}
              </Text>
              <View style={styles.rows}>
                {section.items.map((item) => (
                  <NotificationRow
                    key={item.id}
                    item={item}
                    time={notificationTime(item, timeZone)}
                    disabled={readOnly}
                    onPress={() => {
                      onActivate(item);
                    }}
                  />
                ))}
              </View>
            </View>
          ))
        : null}
    </RouteSheet>
  );
}

interface NotificationRowProps {
  readonly item: NotificationItem;
  readonly time: string;
  readonly disabled: boolean;
  readonly onPress: () => void;
}

const ORANGE_TYPES = new Set(['new_gap', 'session_to_reschedule']);
const REVISION_TYPES = new Set(['global_quiz_today']);

function toneOf(item: NotificationItem): 'orange' | 'lime' | 'indigo' {
  if (ORANGE_TYPES.has(item.type)) return 'orange';
  if (REVISION_TYPES.has(item.type)) return 'lime';
  return 'indigo';
}

/** One row of the centre (ET-5): icon of the type, title, time, body, formation and unread dot. */
export function NotificationRow({ item, time, disabled, onPress }: NotificationRowProps) {
  const unread = item.readAt === null;
  const tone = toneOf(item);
  const iconColor =
    tone === 'orange'
      ? theme.colors.orangeInk
      : tone === 'lime'
        ? theme.colors.limeInk
        : theme.colors.indigoInk;

  return (
    <Pressable
      testID={`notification-item-${item.id}`}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}. ${item.body}`}
      accessibilityState={{ disabled }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
    >
      <View
        style={[
          styles.rowIcon,
          tone === 'orange' ? styles.rowIconOrange : null,
          tone === 'lime' ? styles.rowIconLime : null,
          tone === 'indigo' ? styles.rowIconIndigo : null,
        ]}
      >
        <Icon name={iconOf(item)} size={18} color={iconColor} />
      </View>
      <View style={styles.rowBody}>
        <View style={styles.rowHead}>
          <Text variant="title" style={styles.rowTitle} numberOfLines={2}>
            {item.title}
          </Text>
          <Text variant="caption" tone="muted">
            {time}
          </Text>
        </View>
        <Text variant="rowSubtitle" tone="secondary">
          {item.body}
        </Text>
        {item.formationTitle === null ? null : (
          <View style={styles.formation}>
            <View style={styles.formationDot} />
            <Text variant="caption" tone="muted">
              {item.formationTitle}
            </Text>
          </View>
        )}
      </View>
      {unread ? (
        <View
          testID={`notification-unread-${item.id}`}
          accessibilityLabel={fr.mobile.notifications.unreadDot}
          style={styles.unreadDot}
        />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tools: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  filter: { flex: 1 },
  loading: { gap: theme.spacing.sm },
  groupLabel: { marginBottom: theme.spacing.xs, marginTop: theme.spacing.sm },
  rows: { gap: theme.spacing.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surface,
  },
  rowPressed: { backgroundColor: theme.colors.surfaceSubtle },
  rowIcon: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.control,
  },
  rowIconOrange: { backgroundColor: theme.colors.orangeSoft },
  rowIconLime: { backgroundColor: theme.colors.limeSoft },
  rowIconIndigo: { backgroundColor: theme.colors.indigoSoft },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  rowHead: { flexDirection: 'row', alignItems: 'baseline', gap: theme.spacing.sm },
  rowTitle: { flex: 1, minWidth: 0 },
  formation: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs, marginTop: 2 },
  formationDot: {
    width: 6,
    height: 6,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.indigo,
  },
  unreadDot: {
    width: 8,
    height: 8,
    marginTop: theme.spacing.xs,
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.indigo,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
});
