// Global error boundary of the application (SPEC-3102 EF-6).
//
// Expo Router mounts the `ErrorBoundary` exported by a layout when a screen throws: the learner
// reads « Une erreur inattendue est survenue » and can relaunch the boundary, which re-renders
// the tree instead of leaving a blank screen.
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { Text } from '../../ui/Text';

export interface AppErrorScreenProps {
  /** Message of the failure; never rendered, only kept for the logs of the build. */
  readonly error?: unknown;
  readonly retry: () => void;
}

const t = fr.mobile.shell.states;

/** Screen of the global boundary (EF-6). */
export function AppErrorScreen({ retry }: AppErrorScreenProps) {
  return (
    <View style={styles.base} testID="app-error">
      <View style={styles.icon}>
        <Icon name="alert" size={22} color={theme.colors.orangeInk} />
      </View>
      <Text variant="sectionTitle" align="center">
        {t.unexpectedTitle}
      </Text>
      <Text variant="bodySmall" tone="muted" align="center">
        {t.unexpectedBody}
      </Text>
      <Button label={t.relaunch} testID="app-error-retry" onPress={retry} variant="outline" />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    alignItems: 'center',
    gap: theme.spacing.md,
    justifyContent: 'center',
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.canvas,
  },
  icon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.orangeSoft,
  },
});
