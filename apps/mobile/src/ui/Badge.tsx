// Badge (SPEC-3002 EF-2): counter of unread notifications, orange pill of the tab bar.
import { StyleSheet, View } from 'react-native';

import { radius, theme } from '../theme';

import { Text } from './Text';

export interface BadgeProps {
  readonly count: number;
  /** Highest value displayed; above it the badge shows `99+`. */
  readonly max?: number;
  /** Announced label, e.g. « 3 notifications non lues ». */
  readonly accessibilityLabel: string;
  readonly testID?: string;
}

/** Count pill of a navigation entry. */
export function Badge({ count, max = 99, accessibilityLabel, testID }: BadgeProps) {
  const label = count > max ? `${String(max)}+` : String(count);
  return (
    <View
      {...(testID === undefined ? {} : { testID })}
      accessibilityRole="text"
      accessibilityLabel={accessibilityLabel}
      style={styles.base}
    >
      <Text variant="badge" tone="inverse" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    minWidth: 17,
    height: 17,
    paddingHorizontal: theme.spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: theme.colors.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
