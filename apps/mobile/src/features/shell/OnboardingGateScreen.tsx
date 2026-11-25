// Screen of the onboarding gate (SPEC-3102 BR-ACC-04; QA hot fix 2026-11-25).
//
// Centred: the title, the animated tutor, the explanation and « Continuer sur le web » right
// below it. There is no « J'ai terminé » any more: the end of the web configuration brings the
// learner back and the route re-reads the state by itself.
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';

import { TutorBot } from './TutorBot';

export interface OnboardingGateScreenProps {
  /** Continues the configuration on the web, signed in with the session of the app. */
  readonly onContinue: () => void;
  /** True while the web is being opened or the state re-read. */
  readonly busy?: boolean;
}

const t = fr.mobile.shell.states;

/** The only screen a learner with an unfinished configuration can see (CA-3). */
export function OnboardingGateScreen({ onContinue, busy = false }: OnboardingGateScreenProps) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.base,
        { paddingTop: insets.top, paddingBottom: insets.bottom + theme.spacing.xl },
      ]}
      testID="onboarding-gate"
    >
      <View style={styles.content}>
        <Text align="center" variant="largeTitle">
          {t.onboardingTitle}
        </Text>
        <TutorBot size={190} testID="onboarding-bot" />
        <Text align="center" variant="body" tone="secondary">
          {t.onboardingBody}
        </Text>
        <View style={styles.action}>
          <Button
            block
            label={fr.mobile.shell.web.continue}
            loading={busy}
            testID="onboarding-continue"
            onPress={onContinue}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: theme.colors.canvas,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.xl,
  },
  action: { alignSelf: 'stretch', marginTop: theme.spacing.sm },
});
