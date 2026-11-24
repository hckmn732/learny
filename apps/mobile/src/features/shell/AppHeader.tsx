// Header of a tab screen (SPEC-3102 EF-1, BR-NAV-01, ET-2, ET-5; canevas § 3).
//
// Large title on iOS, top app bar on Android: over-title in the learner's zone, the title of the
// tab, then the two actions of the mockup — the bell with its unread pastille and the account
// disc. The bell and the disc keep a 44/48 pt target and announce their state; the pastille is
// refreshed every 60 s only while `active` (the visible tab, ET-2).
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { clock } from '../../lib/clock';
import { formatLongDay } from '../../lib/dates';
import { theme, verticalHitSlop } from '../../theme';
import { Avatar } from '../../ui/Avatar';
import { Badge } from '../../ui/Badge';
import { IconButton } from '../../ui/IconButton';
import { LargeTitleHeader } from '../../ui/LargeTitleHeader';

import { initialsOf, useHeader, useUnreadCount } from './use-shell';

export interface AppHeaderProps {
  readonly title: string;
  /** Over-title; the current day in the zone of the learner by default. */
  readonly eyebrow?: string;
  /** Shows the bell and the account disc (Aujourd'hui, BR-NAV-01). */
  readonly actions?: boolean;
  /** Polls the unread count while true (ET-2). */
  readonly active?: boolean;
  readonly testID?: string;
}

/** Header of the root screen of a tab. */
export function AppHeader({
  title,
  eyebrow,
  actions = false,
  active = true,
  testID = 'header',
}: AppHeaderProps) {
  const router = useRouter();
  const header = useHeader();
  const unread = useUnreadCount({ active: actions && active });
  const count = header.data?.unreadNotificationCount ?? unread.count;
  const initials = header.data === null ? '…' : initialsOf(header.data);

  return (
    <LargeTitleHeader
      title={title}
      eyebrow={eyebrow ?? formatLongDay(clock.now())}
      testID={testID}
      actions={
        actions ? (
          <View style={styles.actions}>
            <View>
              <IconButton
                testID="header-bell"
                name="bell"
                accessibilityLabel={fr.shell.header.notificationsLabel(count)}
                onPress={() => {
                  router.push('/notifications');
                }}
              />
              {count > 0 ? (
                <View style={styles.badge} pointerEvents="none">
                  <Badge
                    testID="header-unread-badge"
                    count={count}
                    accessibilityLabel={fr.mobile.shell.header.badge(count)}
                  />
                </View>
              ) : null}
            </View>
            <Pressable
              testID="header-account"
              accessibilityRole="button"
              accessibilityLabel={fr.shell.header.accountButton}
              onPress={() => {
                router.push('/compte');
              }}
              hitSlop={{ top: verticalHitSlop(theme.controls.avatar.md) }}
            >
              <Avatar initials={initials} />
            </Pressable>
          </View>
        ) : undefined
      }
    />
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
  badge: { position: 'absolute', top: -theme.spacing.xs, right: -theme.spacing.xs },
});
