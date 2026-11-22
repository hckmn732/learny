// Error state (SPEC-3002 EF-2): what failed, and a « Réessayer » action whose label comes from the
// shared catalogue (never a hard-coded text, canevas § 2).
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { radius, theme } from '../theme';

import { Button } from './Button';
import { Icon } from './Icon';
import { Text } from './Text';

export interface ErrorStateProps {
  readonly title?: string;
  readonly description?: string;
  readonly onRetry: () => void;
  readonly testID?: string;
}

/** Recoverable failure: the action retries the request. */
export function ErrorState({ title, description, onRetry, testID }: ErrorStateProps) {
  const t = fr.mobile.ui;
  return (
    <View
      {...(testID === undefined ? {} : { testID })}
      accessibilityRole="alert"
      style={styles.base}
    >
      <View style={styles.icon}>
        <Icon name="alert" size={20} color={theme.colors.orangeInk} />
      </View>
      <Text variant="sectionTitle" align="center">
        {title ?? t.errorTitle}
      </Text>
      <Text variant="rowSubtitle" tone="muted" align="center">
        {description ?? t.errorBody}
      </Text>
      <Button
        label={t.retry}
        onPress={onRetry}
        variant="outline"
        size="sm"
        {...(testID === undefined ? {} : { testID: `${testID}-retry` })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    gap: theme.spacing.sm,
    padding: theme.spacing.xxl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: radius.list,
    backgroundColor: theme.colors.surface,
  },
  icon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.orangeSoft,
  },
});
