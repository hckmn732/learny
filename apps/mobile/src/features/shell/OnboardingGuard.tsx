// Guard of the onboarding (SPEC-3102 BR-ACC-04, CA-3, CL-4; ADR-3002 § 3).
//
// Mounted by the group of the connected screens: while the configuration is not finished, the
// only reachable screen is « Terminez votre configuration sur le web ». The state is re-read
// when the application comes back to the foreground (CL-4) and by the « J'ai terminé » action.
import { Redirect } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { ErrorState } from '../../ui/ErrorState';
import { Skeleton } from '../../ui/Skeleton';
import { Text } from '../../ui/Text';

import { useOnboarding } from './use-shell';

export interface OnboardingGuardProps {
  readonly children: ReactNode;
}

/** Gate of the connected group. */
export function OnboardingGuard({ children }: OnboardingGuardProps) {
  const onboarding = useOnboarding();

  if (onboarding.status === 'loading') {
    return (
      <View style={styles.pending} testID="onboarding-loading">
        <Skeleton lines={2} animated={false} />
        <Text variant="bodySmall" tone="muted">
          {fr.mobile.shell.states.onboardingChecking}
        </Text>
      </View>
    );
  }

  if (onboarding.status === 'error') {
    return (
      <View style={styles.pending}>
        <ErrorState
          testID="onboarding-error"
          title={fr.mobile.shell.states.onboardingError}
          onRetry={onboarding.retry}
        />
      </View>
    );
  }

  if (!onboarding.completed) return <Redirect href="/terminer-sur-le-web" />;

  return <>{children}</>;
}

const styles = StyleSheet.create({
  pending: {
    flex: 1,
    gap: theme.spacing.md,
    justifyContent: 'center',
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.canvas,
  },
});
