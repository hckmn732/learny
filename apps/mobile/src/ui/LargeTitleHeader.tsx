// Large title header (SPEC-3002 EF-2; SPEC-3201 CA-5): eyebrow and title, 34 pt on iOS and 31 sp on
// Android, with optional trailing actions (an icon button, a header action in place of the Android
// FAB).
//
// Geometry of the mockups (`design/app-mobile/assets/app.css` `.largehead` and
// `.app[data-p="android"] .largehead`): 12 px 20 px 18 px on iOS, 4 px 16 px 12 px on Android, drawn
// under a 54 px / 30 px status bar. The real inset of the device replaces that bar (ADR-3003 § 3:
// the native bars are rendered by the system, never by the application), with the height of the
// export as a floor so that the content starts on the baseline of the comparison.
import type { ReactNode } from 'react';
import { useContext } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { theme } from '../theme';

import { Text } from './Text';

/** Inset used when the header is rendered outside a `SafeAreaProvider` (tests, previews). */
const NO_INSETS = { top: 0, right: 0, bottom: 0, left: 0 } as const;

/** Status bar of the exports, in pt/dp (`app.css` `.statusbar`). */
const EXPORT_STATUS_BAR = { ios: 54, android: 30 } as const;

/** Padding of the exports, in pt/dp (`app.css` `.largehead`). */
const PADDING = {
  ios: { top: 12, horizontal: 20, bottom: 18 },
  android: { top: 4, horizontal: 16, bottom: 12 },
} as const;

export interface LargeTitleHeaderProps {
  readonly title: string;
  readonly eyebrow?: string;
  readonly actions?: ReactNode;
  readonly testID?: string;
}

/** Header of a tab screen. */
export function LargeTitleHeader({ title, eyebrow, actions, testID }: LargeTitleHeaderProps) {
  const insets = useContext(SafeAreaInsetsContext) ?? NO_INSETS;
  const padding = PADDING[theme.platform];
  const statusBar = Math.max(insets.top, EXPORT_STATUS_BAR[theme.platform]);

  return (
    <View
      {...(testID === undefined ? {} : { testID })}
      style={[
        styles.base,
        {
          paddingTop: statusBar + padding.top,
          paddingHorizontal: padding.horizontal,
          paddingBottom: padding.bottom,
        },
        theme.platform === 'ios' ? styles.ios : styles.android,
      ]}
    >
      <View style={styles.texts}>
        {eyebrow === undefined ? null : (
          <Text variant="eyebrow" tone="muted">
            {eyebrow}
          </Text>
        )}
        <Text variant="largeTitle" {...(testID === undefined ? {} : { testID: `${testID}-title` })}>
          {title}
        </Text>
      </View>
      {actions === undefined ? null : <View style={styles.actions}>{actions}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
  },
  ios: { alignItems: 'flex-start' },
  android: { alignItems: 'center' },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
});
