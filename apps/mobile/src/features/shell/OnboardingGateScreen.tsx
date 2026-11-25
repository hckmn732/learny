// Screen of the onboarding gate (SPEC-3102 BR-ACC-04; QA hot fix 2026-11-25; quickfix
// « rattrapage mobile »).
//
// Centred: the title, the animated tutor, the explanation and the action that opens the native
// first steps (`/premiers-pas/1`) right below it. There is no « J'ai terminé » any more: the end of
// the configuration brings the learner back and the route re-reads the state by itself.
//
// TODO(quickfix) — l'écran web de secours (`openOnboardingOnWeb`,
// `src/features/shell/web-handoff.ts`) n'est plus branché ici : les premiers pas natifs prennent le
// relais.
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Text } from '../../ui/Text';

import { TutorBot } from './TutorBot';

const t = fr.mobile.shell.states;

/** The only screen a learner with an unfinished configuration can see (CA-3). */
export function OnboardingGateScreen() {
  const router = useRouter();
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
            label={t.onboardingContinue}
            testID="onboarding-continue"
            onPress={() => {
              // Quickfix « rattrapage mobile » — les premiers pas natifs prennent le relais.
              router.replace('/premiers-pas/1');
            }}
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
