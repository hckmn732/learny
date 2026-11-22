// Group header of a list (SPEC-3002 EF-2): the small uppercase caption of the settings screens.
import { StyleSheet, View } from 'react-native';

import { theme } from '../theme';

import { Text } from './Text';

export interface ListGroupHeaderProps {
  readonly title: string;
  readonly testID?: string;
}

/** Caption above a group of rows. */
export function ListGroupHeader({ title, testID }: ListGroupHeaderProps) {
  return (
    <View {...(testID === undefined ? {} : { testID })} style={styles.base}>
      <Text variant="label" tone="muted">
        {title}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.xs,
  },
});
