// Large title header (SPEC-3002 EF-2): eyebrow and title, 34 pt on iOS and 31 sp on Android, with
// optional trailing actions (an icon button, a header action in place of the Android FAB).
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { theme } from '../theme';

import { Text } from './Text';

export interface LargeTitleHeaderProps {
  readonly title: string;
  readonly eyebrow?: string;
  readonly actions?: ReactNode;
  readonly testID?: string;
}

/** Header of a tab screen. */
export function LargeTitleHeader({ title, eyebrow, actions, testID }: LargeTitleHeaderProps) {
  return (
    <View {...(testID === undefined ? {} : { testID })} style={styles.base}>
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: theme.spacing.md,
    paddingHorizontal: theme.spacing.xl,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  texts: { flex: 1, minWidth: 0, gap: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm },
});
