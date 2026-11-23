// Large title header (SPEC-3002 EF-2; SPEC-3202 EF-1): eyebrow and title, 34 pt on iOS and 31 sp
// on Android, with optional trailing actions (an icon button, a header action in place of the
// Android FAB). The eyebrow can be a button — the formation switcher of the Programme tab.
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { theme, verticalHitSlop } from '../theme';

import { Icon } from './Icon';
import { Text } from './Text';

export interface LargeTitleHeaderProps {
  readonly title: string;
  readonly eyebrow?: string;
  /** Makes the over-title a button (SPEC-3202 EF-1: formation switcher). */
  readonly eyebrowAction?: () => void;
  readonly eyebrowActionLabel?: string;
  /** Draws a chevron after the over-title, only when the eyebrow is a button (CL-3). */
  readonly eyebrowChevron?: boolean;
  readonly actions?: ReactNode;
  readonly testID?: string;
}

/** Header of a tab screen. */
export function LargeTitleHeader({
  title,
  eyebrow,
  eyebrowAction,
  eyebrowActionLabel,
  eyebrowChevron = false,
  actions,
  testID,
}: LargeTitleHeaderProps) {
  const eyebrowText =
    eyebrow === undefined ? null : (
      <Text variant="eyebrow" tone="muted">
        {eyebrow}
      </Text>
    );
  return (
    <View {...(testID === undefined ? {} : { testID })} style={styles.base}>
      <View style={styles.texts}>
        {eyebrow === undefined ? null : eyebrowAction === undefined ? (
          eyebrowText
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={eyebrowActionLabel ?? eyebrow}
            onPress={eyebrowAction}
            hitSlop={verticalHitSlop(theme.minTouchTarget.height)}
            style={styles.eyebrowButton}
          >
            {eyebrowText}
            {eyebrowChevron ? (
              <Icon name="chevronDown" size={12} color={theme.colors.inkMuted} />
            ) : null}
          </Pressable>
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  eyebrowButton: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.xs },
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
});
