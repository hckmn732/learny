// Large title header (SPEC-3002 EF-2; SPEC-3201 CA-5): eyebrow and title, 34 pt on iOS and 31 sp on
// Android, with optional trailing actions (an icon button, a header action in place of the Android
// FAB).
//
// Geometry of the mockups (`design/app-mobile/assets/app.css` `.largehead` and
// `.app[data-p="android"] .largehead`): 12 px 20 px 18 px on iOS, 4 px 16 px 12 px on Android, drawn
// under a 54 px / 30 px status bar. The exports draw that band themselves and ADR-3003 § 3 leaves
// the native bars to the system: the header reserves the band of the reference so that the screen
// starts on the baseline of the visual comparison, whatever the height the system UI announces
// (128 px on the emulator of the campaign, for a declared inset of 24 dp).
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { theme } from '../theme';

import { Text } from './Text';

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
  const padding = PADDING[theme.platform];
  const statusBar = EXPORT_STATUS_BAR[theme.platform];

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
