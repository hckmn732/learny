// Empty state (SPEC-3002 EF-2): dashed card, icon tile and one optional action.
import { StyleSheet, View } from 'react-native';

import { radius, theme } from '../theme';

import { Button } from './Button';
import { Icon } from './Icon';
import type { IconName } from './icons';
import { Text } from './Text';

export interface EmptyStateAction {
  readonly label: string;
  readonly onPress: () => void;
}

export interface EmptyStateProps {
  readonly title: string;
  readonly description?: string;
  readonly icon?: IconName;
  readonly action?: EmptyStateAction;
  readonly testID?: string;
}

/** Nothing to show yet: says why and what to do. */
export function EmptyState({
  title,
  description,
  icon = 'cards',
  action,
  testID,
}: EmptyStateProps) {
  return (
    <View {...(testID === undefined ? {} : { testID })} style={styles.base}>
      <View style={styles.icon}>
        <Icon name={icon} size={20} color={theme.colors.inkMuted} />
      </View>
      <Text variant="sectionTitle" align="center">
        {title}
      </Text>
      {description === undefined ? null : (
        <Text variant="rowSubtitle" tone="muted" align="center">
          {description}
        </Text>
      )}
      {action === undefined ? null : (
        <Button label={action.label} onPress={action.onPress} variant="outline" size="sm" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.xxl,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.borderStrong,
    borderRadius: radius.list,
    backgroundColor: theme.colors.surface,
  },
  icon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.surfaceSubtle,
  },
});
