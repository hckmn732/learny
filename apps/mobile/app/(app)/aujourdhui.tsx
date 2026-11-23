// Shell placeholder of the mobile track (SPEC-3101 EF-7, BR-ACC-09).
//
// The connected shell — tabs Aujourd'hui, Programme, Réviser, Agenda, Profil — is SPEC-3102.
// Until then this screen is the destination of a successful sign-in and carries the
// « Se déconnecter » action that BR-ACC-09 requires (EF-9 exposes `signOut()`); SPEC-3102
// replaces this file with the real tabs.
import type { ReactElement } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fr } from '@learny/i18n';

import { useSession } from '../../src/auth/session';
import { spacing, theme } from '../../src/theme';
import { Button } from '../../src/ui/Button';
import { Text } from '../../src/ui/Text';

const t = fr.mobile.auth.shell;

/** Destination of a signed-in learner until SPEC-3102 (EF-7). */
export default function AujourdhuiShellPlaceholder(): ReactElement {
  const session = useSession();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.root,
        { paddingBottom: insets.bottom + spacing.xxl, paddingTop: insets.top + spacing.xxxl },
      ]}
      testID="shell-placeholder"
    >
      <View style={styles.body}>
        <Text variant="largeTitle">{t.title}</Text>
        <Text tone="secondary" variant="body">
          {t.body}
        </Text>
        <Text testID="shell-placeholder-state" tone="muted" variant="caption">
          {session.status === 'signedIn' ? 'signedIn' : 'signedOut'}
        </Text>
      </View>
      <Button
        block
        label={fr.mobile.session.signOut}
        onPress={() => {
          void session.signOut();
        }}
        testID="auth-signout"
        variant="outline"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: { gap: spacing.lg },
  root: {
    backgroundColor: theme.colors.canvas,
    flex: 1,
    gap: spacing.xxl,
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xxl,
  },
});
