// Screen of the onboarding gate (SPEC-3102 BR-ACC-04, CA-3, CL-4).
//
// The learner finishes the configuration on the web (« Continuer sur le web », ADR-3002 § 3) and
// comes back here; « J'ai terminé » re-reads `GET /me/onboarding` and releases the access as soon
// as the server answers `done`, without restarting the application.
import { StyleSheet, View } from 'react-native';

import { fr } from '@learny/i18n';

import { theme } from '../../theme';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { LargeTitleHeader } from '../../ui/LargeTitleHeader';
import { Text } from '../../ui/Text';

export interface OnboardingGateScreenProps {
  /** Continues the configuration on the web for the current step. */
  readonly onContinue: () => void;
  /** Re-reads the configuration; answers whether the access is open. */
  readonly onDone: () => Promise<boolean>;
  readonly busy?: boolean;
}

const t = fr.mobile.shell.states;

/** The only screen a learner with an unfinished configuration can see (CA-3). */
export function OnboardingGateScreen({
  onContinue,
  onDone,
  busy = false,
}: OnboardingGateScreenProps) {
  return (
    <View style={styles.base} testID="onboarding-gate">
      <LargeTitleHeader title={t.onboardingTitle} eyebrow={fr.mobile.shell.web.continue} />
      <View style={styles.body}>
        <View style={styles.icon}>
          <Icon name="sparkles" size={22} color={theme.colors.indigoInk} />
        </View>
        <Text variant="body" tone="secondary">
          {t.onboardingBody}
        </Text>
      </View>
      <View style={styles.actions}>
        <Button
          block
          label={fr.mobile.shell.web.continue}
          testID="onboarding-continue"
          onPress={onContinue}
        />
        <Button
          block
          variant="outline"
          label={t.onboardingDone}
          testID="onboarding-done"
          disabled={busy}
          onPress={() => {
            void onDone();
          }}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
    gap: theme.spacing.xl,
    paddingBottom: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.xl,
    backgroundColor: theme.colors.canvas,
  },
  body: { flex: 1, gap: theme.spacing.md, justifyContent: 'center' },
  icon: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radius.control,
    backgroundColor: theme.colors.indigoSoft,
  },
  actions: { gap: theme.spacing.md },
});
