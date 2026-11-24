// Sheet of a modal route (SPEC-3102 EF-3, EF-4, ET-5; canevas § 3).
//
// The notifications centre and the account sheet are routes (`app/notifications.tsx`,
// `app/compte.tsx`) presented as transparent modals, so the screen behind stays visible and the
// sheet keeps the native geometry: grabber, radius 24 on iOS / 28 on Android, backdrop that
// closes it, system back through the navigator. `Sheet` (SPEC-3002) remains the non-routed
// sheet of the fiches.
import type { ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { controls, radius, theme } from '../../theme';
import { Icon } from '../../ui/Icon';
import type { IconName } from '../../ui/icons';
import { Text } from '../../ui/Text';

export interface RouteSheetProps {
  readonly testID: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly icon?: IconName;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
  readonly refreshing?: boolean;
  readonly onRefresh?: () => void;
}

/** Bottom sheet of a modal route. */
export function RouteSheet({
  testID,
  title,
  subtitle,
  icon = 'bell',
  onClose,
  children,
  footer,
  refreshing = false,
  onRefresh,
}: RouteSheetProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <Pressable
        testID={`${testID}-backdrop`}
        accessibilityRole="button"
        accessibilityLabel={fr.mobile.ui.close}
        onPress={onClose}
        style={styles.backdrop}
      />
      <View
        testID={testID}
        accessibilityViewIsModal
        style={[styles.panel, { paddingBottom: insets.bottom + theme.spacing.md }]}
      >
        <View style={styles.grabber} />
        <View style={styles.header}>
          <View style={styles.iconTile}>
            <Icon name={icon} size={20} color={theme.colors.lime} />
          </View>
          <View style={styles.headerTexts}>
            <Text variant="sheetTitle" testID={`${testID}-title`}>
              {title}
            </Text>
            {subtitle === undefined ? null : (
              <Text variant="rowSubtitle" tone="muted" testID={`${testID}-subtitle`}>
                {subtitle}
              </Text>
            )}
          </View>
          <Pressable
            testID={`${testID}-close`}
            accessibilityRole="button"
            accessibilityLabel={fr.mobile.ui.close}
            onPress={onClose}
            hitSlop={theme.spacing.md}
          >
            <Icon name="x" size={20} color={theme.colors.inkMuted} />
          </Pressable>
        </View>
        <ScrollView
          testID={`${testID}-body`}
          style={styles.body}
          contentContainerStyle={styles.bodyContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            onRefresh === undefined ? undefined : (
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={theme.colors.inkMuted}
              />
            )
          }
        >
          {children}
        </ScrollView>
        {footer === undefined ? null : <View style={styles.footer}>{footer}</View>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: theme.colors.overlay,
  },
  panel: {
    maxHeight: '92%',
    minHeight: '46%',
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    ...theme.elevation.sheet,
  },
  grabber: {
    alignSelf: 'center',
    width: controls.sheetGrabber.width,
    height: controls.sheetGrabber.height,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: theme.colors.handle,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.md,
  },
  iconTile: {
    width: theme.controls.iconButton,
    height: theme.controls.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.iconButton,
    backgroundColor: theme.colors.ink,
  },
  headerTexts: { flex: 1, minWidth: 0, gap: 2 },
  body: { flexGrow: 0 },
  bodyContent: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    gap: theme.spacing.md,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.divider,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
});
